import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppStatus, WordPressConfig, GeneratedPost, BulkItem, DashboardStats, SiteProfile, AppSettings } from './types';
import { generateSEOContent } from './services/geminiService';
import { publishToWordPress, fetchPostStats, fetchScheduledPosts, uploadMediaToWordPress } from './services/wordPressService';
import { supabase, loginWithPassword, logout, getCurrentUser, loadSettingsFromCloud, saveSettingsToCloud, getPendingCommands, markCommandProcessed, updateBotStatus } from './services/supabaseService';
import { notifyPublishSuccess, notifyPublishFailed, notifyBatchStart, notifyBatchComplete, notifyPaused, notifyResumed, notifyStatus } from './services/telegramService';
import SettingsModal from './components/SettingsModal';
import PreviewModal from './components/PreviewModal';
import AuthModal from './components/AuthModal';
import type { User } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════
// 🎯 기본 설정값
// ═══════════════════════════════════════════════════════════

const DEFAULT_CONFIG: WordPressConfig = {
  siteUrl: '',
  username: '',
  applicationPassword: '',
  apiKeys: [],
  currentKeyIndex: 0,
  customInstruction: '',
  adCode1: '',
  adCode2: '',
  enableAiImage: false,
  defaultCategoryId: ''
};

const DEFAULT_SETTINGS: AppSettings = {
  profiles: [],
  currentProfileId: null
};

// ═══════════════════════════════════════════════════════════
// 🏠 메인 앱 컴포넌트
// ═══════════════════════════════════════════════════════════

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'writer' | 'manager'>('writer');
  const [bulkInput, setBulkInput] = useState('');
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [queue, setQueue] = useState<BulkItem[]>([]);

  // 🆕 멀티 프로필 관리
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [currentProfile, setCurrentProfile] = useState<SiteProfile | null>(null);

  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [previewPost, setPreviewPost] = useState<GeneratedPost | null>(null);
  const [publishedPosts, setPublishedPosts] = useState<GeneratedPost[]>([]);
  const [stats, setStats] = useState<DashboardStats>({ unprocessed: 0, localPending: 0, wpDraft: 0, wpFuture: 0, wpPublish: 0 });
  const [globalError, setGlobalError] = useState<string | null>(null);

  // 🔐 인증 상태
  const [user, setUser] = useState<User | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  // ⏸️ 일시정지 상태
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);

  // 스케줄링 설정 (한국표준시 기반)
  const getKSTDate = () => {
    const now = new Date();
    const kstOffset = 9 * 60;
    const utcOffset = now.getTimezoneOffset();
    const kstTime = new Date(now.getTime() + (utcOffset + kstOffset) * 60000);
    return kstTime.toISOString().slice(0, 16);
  };

  // 스케줄 설정 불러오기 (localStorage에서)
  const getInitialScheduleConfig = () => {
    try {
      const saved = localStorage.getItem('wp-schedule-config');
      if (saved) {
        const parsed = JSON.parse(saved);
        console.log('📅 스케줄 설정 복원됨');
        return {
          status: parsed.status || 'draft',
          startTime: parsed.startTime || getKSTDate(),
          interval: parsed.interval || 30
        };
      }
    } catch (e) {
      console.error('스케줄 설정 불러오기 실패:', e);
    }
    return {
      status: 'draft' as 'draft' | 'publish' | 'future',
      startTime: getKSTDate(),
      interval: 30
    };
  };

  const [scheduleConfig, setScheduleConfig] = useState(getInitialScheduleConfig());

  // ═══════════════════════════════════════════════════════════
  // 🔐 앱 시작 시 인증 상태 확인
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const sessionUser = data.session?.user ?? null;
      setUser(sessionUser);
      console.log(sessionUser ? '🔐 로그인됨:' : '🔓 비로그인');
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // ═══════════════════════════════════════════════════════════
  // 🤖 Telegram 봇 명령어 폴링 (5초마다)
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!user) return;

    const pollCommands = async () => {
      const commands = await getPendingCommands(user.id);

      for (const cmd of commands) {
        switch (cmd.command) {
          case 'pause':
            setIsPaused(true);
            isPausedRef.current = true;
            notifyPaused();
            break;
          case 'resume':
            setIsPaused(false);
            isPausedRef.current = false;
            notifyResumed();
            break;
          case 'status':
            const completed = queue.filter(q => q.status === 'completed').length;
            const failed = queue.filter(q => q.status === 'failed').length;
            const pending = queue.filter(q => q.status === 'pending').length;
            const current = queue.find(q => q.status === 'generating' || q.status === 'publishing');

            notifyStatus({
              isPaused: isPausedRef.current,
              queueLength: pending,
              completedCount: completed,
              failedCount: failed,
              currentItem: current?.topic.split('///')[0]
            });
            break;
        }

        await markCommandProcessed(cmd.id);
      }
    };

    const interval = setInterval(pollCommands, 5000);
    return () => clearInterval(interval);
  }, [user, queue, isPaused]);

  // ═══════════════════════════════════════════════════════════
  // 📥 앱 시작 시 localStorage에서 설정 불러오기 + 마이그레이션
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    try {
      const saved = localStorage.getItem('wp-multi-site-settings');

      if (saved) {
        const parsed: AppSettings = JSON.parse(saved);
        console.log('✅ 멀티사이트 설정 불러옴:', parsed.profiles.length, '개 프로필');
        setAppSettings(parsed);

        if (parsed.currentProfileId) {
          const profile = parsed.profiles.find(p => p.id === parsed.currentProfileId);
          if (profile) {
            setCurrentProfile(profile);
            refreshStats(profile.config);
          }
        }
      } else {
        // 🔄 기존 단일 사이트 설정 마이그레이션
        const legacyConfig = localStorage.getItem('wp-seo-publisher-config');
        if (legacyConfig) {
          console.log('🔄 기존 설정 마이그레이션 시작...');
          const config: WordPressConfig = JSON.parse(legacyConfig);

          let profileName = '기존 사이트';
          try {
            if (config.siteUrl) {
              profileName = new URL(config.siteUrl).hostname;
            }
          } catch { }

          const migratedProfile: SiteProfile = {
            id: `profile-${Date.now()}`,
            name: profileName,
            config: config,
            createdAt: new Date().toISOString(),
            lastUsedAt: new Date().toISOString()
          };

          const migratedSettings: AppSettings = {
            profiles: [migratedProfile],
            currentProfileId: migratedProfile.id
          };

          setAppSettings(migratedSettings);
          setCurrentProfile(migratedProfile);
          refreshStats(config);

          localStorage.setItem('wp-multi-site-settings', JSON.stringify(migratedSettings));
          console.log('✅ 마이그레이션 완료:', profileName);
        } else {
          console.log('ℹ️ 저장된 설정 없음');
        }
      }
    } catch (e) {
      console.error('❌ 설정 불러오기 실패:', e);
    } finally {
      setIsConfigLoaded(true);
    }
  }, []);

  // ═══════════════════════════════════════════════════════════
  // 💾 설정이 변경될 때마다 자동으로 localStorage + 클라우드에 저장
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (isConfigLoaded && appSettings.profiles.length > 0) {
      try {
        localStorage.setItem('wp-multi-site-settings', JSON.stringify(appSettings));
        console.log('💾 멀티사이트 설정 자동 저장됨');

        // 🆕 로그인 상태면 클라우드에도 저장
        if (user) {
          saveSettingsToCloud(user.id, appSettings);
        }
      } catch (e) {
        console.error('❌ 설정 저장 실패:', e);
      }
    }
  }, [appSettings, isConfigLoaded, user]);

  // ═══════════════════════════════════════════════════════════
  // ☁️ 로그인 시 클라우드에서 설정 불러오기
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!user) return;

    const loadFromCloud = async () => {
      const cloudSettings = await loadSettingsFromCloud(user.id);
      if (cloudSettings && cloudSettings.profiles.length > 0) {
        console.log('☁️ 클라우드 설정으로 덮어쓰기');
        setAppSettings(cloudSettings);

        if (cloudSettings.currentProfileId) {
          const profile = cloudSettings.profiles.find(p => p.id === cloudSettings.currentProfileId);
          if (profile) {
            setCurrentProfile(profile);
            refreshStats(profile.config);
          }
        }
      }
    };

    loadFromCloud();
  }, [user]);

  // 💾 스케줄 설정 변경 시 자동 저장
  useEffect(() => {
    if (isConfigLoaded) {
      try {
        localStorage.setItem('wp-schedule-config', JSON.stringify(scheduleConfig));
        console.log('📅 스케줄 설정 저장됨');
      } catch (e) {
        console.error('스케줄 저장 실패:', e);
      }
    }
  }, [scheduleConfig, isConfigLoaded]);

  const refreshStats = useCallback(async (config: WordPressConfig) => {
    if (!config?.siteUrl) return;
    try {
      const wp = await fetchPostStats(config);
      setStats(prev => ({ ...prev, ...wp }));
    } catch (e) {
      console.error('통계 불러오기 실패:', e);
    }
  }, []);

  // ═══════════════════════════════════════════════════════════
  // 🔄 프로필 관리 함수들
  // ═══════════════════════════════════════════════════════════
  const switchProfile = useCallback((profileId: string) => {
    const profile = appSettings.profiles.find(p => p.id === profileId);
    if (profile) {
      const updatedProfiles = appSettings.profiles.map(p =>
        p.id === profileId ? { ...p, lastUsedAt: new Date().toISOString() } : p
      );

      setAppSettings({
        profiles: updatedProfiles,
        currentProfileId: profileId
      });

      setCurrentProfile(profile);
      refreshStats(profile.config);
      console.log('🔄 프로필 전환:', profile.name);
    }
  }, [appSettings, refreshStats]);

  const saveProfile = useCallback((profileId: string | null, name: string, config: WordPressConfig) => {
    const now = new Date().toISOString();

    if (profileId) {
      const updatedProfiles = appSettings.profiles.map(p =>
        p.id === profileId
          ? { ...p, name, config, lastUsedAt: now }
          : p
      );

      const newSettings = {
        profiles: updatedProfiles,
        currentProfileId: profileId
      };

      setAppSettings(newSettings);

      const updatedProfile = updatedProfiles.find(p => p.id === profileId);
      if (updatedProfile) {
        setCurrentProfile(updatedProfile);
        refreshStats(config);
      }

      console.log('✅ 프로필 수정:', name);
    } else {
      const newProfile: SiteProfile = {
        id: `profile-${Date.now()}`,
        name,
        config,
        createdAt: now,
        lastUsedAt: now
      };

      const newSettings = {
        profiles: [...appSettings.profiles, newProfile],
        currentProfileId: newProfile.id
      };

      setAppSettings(newSettings);
      setCurrentProfile(newProfile);
      refreshStats(config);

      console.log('✅ 새 프로필 생성:', name);
    }
  }, [appSettings, refreshStats]);

  const deleteProfile = useCallback((profileId: string) => {
    const updatedProfiles = appSettings.profiles.filter(p => p.id !== profileId);

    let newCurrentProfileId = appSettings.currentProfileId;
    if (appSettings.currentProfileId === profileId) {
      newCurrentProfileId = updatedProfiles.length > 0 ? updatedProfiles[0].id : null;
    }

    const newSettings = {
      profiles: updatedProfiles,
      currentProfileId: newCurrentProfileId
    };

    setAppSettings(newSettings);

    if (newCurrentProfileId) {
      const newProfile = updatedProfiles.find(p => p.id === newCurrentProfileId);
      if (newProfile) {
        setCurrentProfile(newProfile);
        refreshStats(newProfile.config);
      }
    } else {
      setCurrentProfile(null);
    }

    console.log('🗑️ 프로필 삭제:', profileId);
  }, [appSettings, refreshStats]);

  const handleKeyIndexChange = useCallback((newIndex: number) => {
    if (!currentProfile) return;

    console.log(`🔄 API 키 전환: #${newIndex + 1}`);

    const updatedConfig = {
      ...currentProfile.config,
      currentKeyIndex: newIndex
    };

    const updatedProfiles = appSettings.profiles.map(p =>
      p.id === currentProfile.id
        ? { ...p, config: updatedConfig }
        : p
    );

    setAppSettings({
      ...appSettings,
      profiles: updatedProfiles
    });

    setCurrentProfile({
      ...currentProfile,
      config: updatedConfig
    });
  }, [currentProfile, appSettings]);

  // ═══════════════════════════════════════════════════════════
  // ⚙️ 배치 처리 함수들
  // ═══════════════════════════════════════════════════════════
  const processQueueItem = async (index: number, config: WordPressConfig, items: BulkItem[]) => {
    setQueue(prev => prev.map((it, idx) => idx === index ? { ...it, status: 'generating', error: undefined } : it));

    try {
      const post = await generateSEOContent(items[index].topic, config, handleKeyIndexChange);

      // 🆕 스마트 스케줄링: 과거면 즉시발행, 미래면 예약
      const scheduledDate = items[index].scheduledDate;
      if (scheduledDate) {
        const scheduleTime = new Date(scheduledDate).getTime();
        const now = Date.now();

        if (scheduleTime <= now) {
          // 과거 또는 현재 → 즉시 발행
          post.status = 'publish';
          post.date = scheduledDate;
          console.log(`📤 즉시발행: ${scheduledDate} (과거)`);
        } else {
          // 미래 → 예약
          post.status = 'future';
          post.date = scheduledDate;
          console.log(`⏰ 예약발행: ${scheduledDate} (미래)`);
        }
      } else {
        post.status = scheduleConfig.status;
      }

      if (config.defaultCategoryId) {
        post.categories = [parseInt(config.defaultCategoryId)];
      }

      setQueue(prev => prev.map((it, idx) => idx === index ? { ...it, status: 'publishing', result: post } : it));

      // 🆕 썸네일을 미디어 라이브러리에 업로드 (FIFU 호환)
      if (post.thumbnailData) {
        try {
          const filename = `thumbnail-${Date.now()}`;
          const mediaUrl = await uploadMediaToWordPress(config, `data:image/webp;base64,${post.thumbnailData}`, filename);

          if (mediaUrl) {
            // base64를 실제 URL로 교체
            post.content = post.content.replace(
              /src="data:image\/webp;base64,[^"]+"/g,
              `src="${mediaUrl}"`
            );
            post.featuredMediaUrl = mediaUrl;
            console.log('✅ 썸네일 업로드 완료:', mediaUrl);
          }
        } catch (e) {
          console.warn('썸네일 업로드 실패, base64 유지:', e);
        }
      }

      const wpResult = await publishToWordPress(config, post);
      post.id = wpResult.id;

      setQueue(prev => prev.map((it, idx) => idx === index ? { ...it, status: 'completed', result: post } : it));
      refreshStats(config);

      // 🆕 개별 발행 성공 알림
      notifyPublishSuccess(post.title, config.siteUrl);

    } catch (e: any) {
      const title = items[index].topic.split('///')[0];
      setQueue(prev => prev.map((it, idx) => {
        if (idx === index) {
          return {
            ...it,
            status: 'failed',
            error: e.message || '알 수 없는 오류가 발생했습니다.',
            result: it.result
          };
        }
        return it;
      }));

      // 🆕 개별 발행 실패 알림
      notifyPublishFailed(title, e.message || '알 수 없는 오류');
    }
  };

  const startBatch = async () => {
    setGlobalError(null);

    if (!currentProfile) {
      setGlobalError('사이트를 선택해주세요. 설정에서 사이트를 추가할 수 있습니다.');
      setIsSettingsOpen(true);
      return;
    }

    const config = currentProfile.config;

    const hasApiKeys = config.apiKeys && config.apiKeys.some(k => k.trim().length > 0);
    if (!hasApiKeys) {
      setGlobalError('API 키가 설정되지 않았습니다. 설정에서 최소 1개 이상의 API 키를 입력해주세요.');
      setIsSettingsOpen(true);
      return;
    }

    if (!config.siteUrl || !config.username || !config.applicationPassword) {
      setGlobalError('WordPress 연결 정보가 불완전합니다. 설정에서 확인해주세요.');
      setIsSettingsOpen(true);
      return;
    }

    const lines = bulkInput.split('\n').filter(l => l.includes('///'));
    if (lines.length === 0) {
      setGlobalError('발행할 주제가 없습니다. "제목///키워드" 형식으로 입력해주세요.');
      return;
    }

    let currentSchedule = new Date(scheduleConfig.startTime);
    if (isNaN(currentSchedule.getTime())) {
      currentSchedule = new Date();
    }

    const items: BulkItem[] = lines.map((topic, i) => ({
      topic,
      status: 'pending',
      scheduledDate: new Date(currentSchedule.getTime() + (i * scheduleConfig.interval * 60000)).toISOString()
    }));

    setQueue(items);
    setStatus(AppStatus.PROCESSING);
    setIsPaused(false);
    isPausedRef.current = false;

    // 텔레그램 배치 시작 알림
    notifyBatchStart(items.length);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < items.length; i++) {
      // 일시정지 대기
      while (isPausedRef.current) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const result = await processQueueItem(i, config, items);
      if (result === 'success') successCount++;
      else failCount++;
    }

    // 텔레그램 배치 완료 알림
    notifyBatchComplete(successCount, failCount);
    setStatus(AppStatus.IDLE);
  };

  const retryItem = async (index: number) => {
    if (!currentProfile) return;
    await processQueueItem(index, currentProfile.config, queue);
  };

  const loadPublishedPosts = async () => {
    if (!currentProfile) return;
    try {
      const posts = await fetchScheduledPosts(currentProfile.config);
      setPublishedPosts(posts);
    } catch (e: any) {
      console.error('포스트 목록 불러오기 실패:', e);
    }
  };

  const inputTopicCount = bulkInput.split('\n').filter(l => l.includes('///')).length;

  // 로딩 중
  if (!isConfigLoaded) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-bold">설정 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20 font-['NanumSquareNeo']">
      {/* 📱 반응형 헤더 */}
      <header className="bg-white border-b sticky top-0 z-50 px-4 md:px-8 shadow-sm">
        <div className="max-w-6xl mx-auto w-full">
          {/* 상단: 로고 + 설정 */}
          <div className="h-16 md:h-20 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-indigo-600 rounded-xl md:rounded-2xl flex items-center justify-center text-white shadow-xl rotate-3">
                <i className="fa-solid fa-rocket text-lg md:text-xl"></i>
              </div>
              <h1 className="font-black text-lg md:text-2xl tracking-tighter uppercase">
                Gem SEO <span className="text-indigo-600">Pro</span>
              </h1>
            </div>

            <div className="flex items-center gap-2 md:gap-4">
              {/* 탭 버튼 - 데스크탑 */}
              <div className="hidden md:flex gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                <button onClick={() => setActiveTab('writer')} className={`px-6 py-2.5 rounded-xl font-black text-sm transition-all ${activeTab === 'writer' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500'}`}>자동 집필</button>
                <button onClick={() => { setActiveTab('manager'); loadPublishedPosts(); }} className={`px-6 py-2.5 rounded-xl font-black text-sm transition-all ${activeTab === 'manager' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500'}`}>발행 관리</button>
              </div>

              {/* 일시정지/재개 버튼 (작업 중일 때만) */}
              {status === AppStatus.PROCESSING && (
                <button
                  onClick={() => {
                    setIsPaused(!isPaused);
                    isPausedRef.current = !isPaused;
                    if (!isPaused) notifyPaused();
                    else notifyResumed();
                  }}
                  className={`px-4 py-2.5 rounded-xl font-black text-sm transition-all shadow-md ${isPaused ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-amber-500 text-white hover:bg-amber-600'}`}
                >
                  <i className={`fa-solid ${isPaused ? 'fa-play' : 'fa-pause'} mr-2`}></i>
                  {isPaused ? '재개' : '일시정지'}
                </button>
              )}

              {/* 로그인 버튼 */}
              {!user && (
                <button
                  onClick={() => setIsAuthOpen(true)}
                  className="px-4 py-2.5 rounded-xl border-2 border-indigo-200 font-black text-sm text-indigo-600 hover:bg-indigo-50 transition-all"
                >
                  <i className="fa-solid fa-cloud mr-2"></i>
                  <span className="hidden lg:inline">클라우드 동기화</span>
                  <span className="lg:hidden">로그인</span>
                </button>
              )}

              {/* 설정 버튼 */}
              <button onClick={() => setIsSettingsOpen(true)} className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl border-2 flex items-center justify-center text-slate-400 hover:text-indigo-600 bg-white transition-all shadow-sm">
                <i className="fa-solid fa-gear text-lg md:text-xl"></i>
              </button>
            </div>
          </div>

          {/* 하단: 사이트 선택 + 모바일 탭 */}
          <div className="pb-3 flex flex-col md:flex-row gap-2 md:hidden">
            {/* 사이트 선택 드롭다운 - 모바일 */}
            {appSettings.profiles.length > 0 && (
              <select
                value={currentProfile?.id || ''}
                onChange={(e) => switchProfile(e.target.value)}
                className="w-full px-4 py-3 bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl font-bold text-sm text-indigo-700 outline-none appearance-none"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236366f1' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.25em 1.25em' }}
              >
                {appSettings.profiles.map(profile => (
                  <option key={profile.id} value={profile.id}>🌐 {profile.name}</option>
                ))}
              </select>
            )}

            {/* 탭 버튼 - 모바일 */}
            <div className="flex gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button onClick={() => setActiveTab('writer')} className={`flex-1 px-4 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'writer' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500'}`}>자동 집필</button>
              <button onClick={() => { setActiveTab('manager'); loadPublishedPosts(); }} className={`flex-1 px-4 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'manager' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500'}`}>발행 관리</button>
            </div>
          </div>

          {/* 사이트 선택 드롭다운 - 데스크탑 (헤더 내부) */}
          {appSettings.profiles.length > 0 && (
            <div className="hidden md:block pb-4">
              <select
                value={currentProfile?.id || ''}
                onChange={(e) => switchProfile(e.target.value)}
                className="px-6 py-2.5 bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl font-bold text-sm text-indigo-700 hover:border-indigo-400 transition-all cursor-pointer outline-none appearance-none pr-10"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236366f1' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
              >
                {appSettings.profiles.map(profile => (
                  <option key={profile.id} value={profile.id}>🌐 {profile.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-6 pt-6 md:pt-12">
        {/* 사이트 선택 안내 */}
        {!currentProfile && (
          <div className="mb-6 md:mb-8 bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-2xl md:rounded-3xl p-6 md:p-8 text-center">
            <div className="w-14 h-14 md:w-16 md:h-16 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl md:rounded-2xl flex items-center justify-center text-white text-2xl md:text-3xl mx-auto mb-4 shadow-xl">
              <i className="fa-solid fa-globe"></i>
            </div>
            <h3 className="text-lg md:text-xl font-black text-indigo-900 mb-2">사이트를 추가해주세요</h3>
            <p className="text-sm text-indigo-700 mb-4 md:mb-6">WordPress 사이트를 추가하고 자동 집필을 시작하세요!</p>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="px-6 md:px-8 py-3 md:py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl md:rounded-2xl font-black text-sm md:text-base hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg shadow-indigo-200"
            >
              <i className="fa-solid fa-plus mr-2"></i>
              첫 번째 사이트 추가하기
            </button>
          </div>
        )}

        {/* 글로벌 에러 알림 */}
        {globalError && (
          <div className="mb-6 md:mb-8 bg-rose-50 border-2 border-rose-200 rounded-2xl md:rounded-3xl p-4 md:p-6 flex items-start gap-3 md:gap-4">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-rose-500 rounded-lg md:rounded-xl flex items-center justify-center text-white shrink-0">
              <i className="fa-solid fa-exclamation-triangle text-sm md:text-base"></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-rose-800 mb-1 text-sm md:text-base">오류 발생</p>
              <p className="text-xs md:text-sm text-rose-600">{globalError}</p>
            </div>
            <button onClick={() => setGlobalError(null)} className="text-rose-400 hover:text-rose-600">
              <i className="fa-solid fa-xmark text-lg md:text-xl"></i>
            </button>
          </div>
        )}

        {currentProfile && activeTab === 'writer' ? (
          <div className="grid lg:grid-cols-12 gap-6 md:gap-10">
            <div className="lg:col-span-8 space-y-6 md:space-y-10">
              {/* 포스팅 주제 입력 */}
              <div className="bg-white rounded-2xl md:rounded-[3.5rem] p-6 md:p-12 shadow-xl md:shadow-2xl border border-slate-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 md:p-8">
                  <div className={`px-4 md:px-8 py-2 md:py-4 rounded-xl md:rounded-3xl font-black text-lg md:text-2xl transition-all shadow-inner ${inputTopicCount > 0 ? 'bg-indigo-600 text-white animate-bounce' : 'bg-slate-100 text-slate-300'}`}>{inputTopicCount}</div>
                </div>
                <h2 className="text-lg md:text-2xl font-black mb-4 md:mb-8 flex items-center gap-3 md:gap-4 text-slate-800">
                  <i className="fa-solid fa-pen-nib text-indigo-600"></i> 포스팅 주제 입력
                </h2>
                <textarea
                  value={bulkInput}
                  onChange={e => setBulkInput(e.target.value)}
                  placeholder={"제목///핵심키워드\n예시: 2024 최신 노트북 추천///노트북 추천\n\n여러 줄 입력 시 순차적으로 발행됩니다"}
                  className="w-full h-48 md:h-80 p-4 md:p-10 bg-slate-50 border-2 border-transparent rounded-xl md:rounded-[2.5rem] outline-none text-sm md:text-lg font-bold resize-none mb-4 md:mb-8 focus:bg-white focus:border-indigo-100 transition-all shadow-inner"
                />
              </div>

              {/* 📅 예약 발행 설정 패널 */}
              <div className="bg-white rounded-2xl md:rounded-[3rem] p-4 md:p-10 shadow-lg md:shadow-xl border border-slate-100">
                <h3 className="text-base md:text-lg font-black mb-4 md:mb-8 flex items-center gap-2 md:gap-3 text-slate-800">
                  <i className="fa-solid fa-calendar-check text-indigo-600"></i>
                  예약 발행 설정
                  <span className="text-[10px] md:text-xs font-bold text-slate-400 bg-slate-100 px-2 md:px-3 py-1 rounded-full ml-1 md:ml-2">KST</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                  {/* 시작 시간 */}
                  <div className="space-y-2 md:space-y-3">
                    <label className="text-[10px] md:text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <i className="fa-regular fa-clock text-indigo-400"></i>
                      시작 시간
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduleConfig.startTime}
                      onChange={e => setScheduleConfig(prev => ({ ...prev, startTime: e.target.value }))}
                      className="w-full px-4 md:px-5 py-3 md:py-4 bg-slate-50 border-2 border-transparent rounded-xl md:rounded-2xl outline-none font-bold text-sm focus:border-indigo-100 focus:bg-white transition-all shadow-inner"
                    />
                  </div>

                  {/* 발행 상태 */}
                  <div className="space-y-2 md:space-y-3">
                    <label className="text-[10px] md:text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <i className="fa-solid fa-toggle-on text-indigo-400"></i>
                      발행 상태
                    </label>
                    <select
                      value={scheduleConfig.status}
                      onChange={e => setScheduleConfig(prev => ({ ...prev, status: e.target.value as 'draft' | 'publish' | 'future' }))}
                      className="w-full px-4 md:px-5 py-3 md:py-4 bg-slate-50 border-2 border-transparent rounded-xl md:rounded-2xl outline-none font-bold text-sm focus:border-indigo-100 focus:bg-white transition-all shadow-inner appearance-none cursor-pointer"
                    >
                      <option value="draft">📝 임시저장</option>
                      <option value="publish">🚀 즉시발행</option>
                      <option value="future">⏰ 예약발행</option>
                    </select>
                  </div>

                  {/* 발행 간격 */}
                  <div className="space-y-2 md:space-y-3">
                    <label className="text-[10px] md:text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <i className="fa-solid fa-stopwatch text-indigo-400"></i>
                      발행 간격
                    </label>
                    <select
                      value={scheduleConfig.interval}
                      onChange={e => setScheduleConfig(prev => ({ ...prev, interval: parseInt(e.target.value) }))}
                      className="w-full px-4 md:px-5 py-3 md:py-4 bg-slate-50 border-2 border-transparent rounded-xl md:rounded-2xl outline-none font-bold text-sm focus:border-indigo-100 focus:bg-white transition-all shadow-inner appearance-none cursor-pointer"
                    >
                      <option value={10}>10분 간격</option>
                      <option value={20}>20분 간격</option>
                      <option value={30}>30분 간격</option>
                      <option value={60}>60분 간격</option>
                      <option value={120}>2시간 간격</option>
                      <option value={360}>6시간 간격</option>
                      <option value={1440}>24시간 간격</option>
                    </select>
                  </div>
                </div>

                {/* 예약 미리보기 */}
                {inputTopicCount > 0 && scheduleConfig.status === 'future' && (
                  <div className="mt-4 md:mt-8 p-4 md:p-6 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl md:rounded-2xl border border-indigo-100">
                    <p className="text-[10px] md:text-xs font-bold text-indigo-600 mb-2 md:mb-3 uppercase tracking-widest">📅 예약 미리보기</p>
                    <div className="flex flex-wrap gap-2">
                      {Array.from({ length: Math.min(inputTopicCount, 5) }).map((_, i) => {
                        const time = new Date(new Date(scheduleConfig.startTime).getTime() + i * scheduleConfig.interval * 60000);
                        return (
                          <span key={i} className="px-3 md:px-4 py-1.5 md:py-2 bg-white rounded-full text-[10px] md:text-xs font-bold text-slate-600 shadow-sm border">
                            #{i + 1} → {time.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        );
                      })}
                      {inputTopicCount > 5 && <span className="px-3 md:px-4 py-1.5 md:py-2 text-[10px] md:text-xs font-bold text-slate-400">...외 {inputTopicCount - 5}개</span>}
                    </div>
                  </div>
                )}
              </div>

              {/* 발행 시작 버튼 */}
              <button
                onClick={startBatch}
                disabled={status === AppStatus.PROCESSING || inputTopicCount === 0}
                className="w-full py-5 md:py-8 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 text-white rounded-xl md:rounded-[2.5rem] font-black text-lg md:text-2xl shadow-[0_10px_30px_rgba(79,70,229,0.3)] md:shadow-[0_20px_50px_rgba(79,70,229,0.3)] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[0_15px_40px_rgba(79,70,229,0.4)] md:hover:shadow-[0_25px_60px_rgba(79,70,229,0.4)] relative overflow-hidden group"
              >
                <span className="relative z-10 flex items-center justify-center gap-3 md:gap-4">
                  {status === AppStatus.PROCESSING ? (
                    <>
                      <div className="w-6 h-6 md:w-8 md:h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                      발행 진행 중...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-rocket text-xl md:text-2xl group-hover:animate-bounce"></i>
                      <span className="hidden sm:inline">광고 자동 삽입 및</span> 발행 시작
                    </>
                  )}
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              </button>

              {/* 작업 큐 */}
              <div className="grid gap-4 md:gap-6">
                {queue.map((item, idx) => (
                  <div key={idx} className={`bg-white p-4 md:p-8 rounded-xl md:rounded-[3rem] border-2 flex flex-col gap-4 md:gap-6 shadow-sm hover:shadow-xl md:hover:shadow-2xl transition-all ${item.status === 'failed' ? 'border-rose-200 bg-rose-50/10' : 'border-slate-50'}`}>
                    <div className="flex items-center gap-4 md:gap-8">
                      <div className="w-16 h-16 md:w-24 md:h-24 rounded-xl md:rounded-[2rem] overflow-hidden bg-slate-100 flex-shrink-0 shadow-inner">
                        {item.result?.featuredMediaUrl ? <img src={item.result.featuredMediaUrl} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center text-indigo-200">{item.status === 'generating' || item.status === 'publishing' ? <div className="w-8 h-8 md:w-10 md:h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div> : <i className="fa-solid fa-hourglass-start text-xl md:text-3xl"></i>}</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-black text-slate-800 text-sm md:text-xl truncate mb-2 md:mb-3">{item.topic.split('///')[0]}</h4>
                        <div className="flex flex-wrap gap-2 items-center">
                          <span className={`inline-flex items-center px-3 md:px-6 py-1.5 md:py-2.5 rounded-full text-[9px] md:text-[11px] font-black uppercase tracking-widest leading-none ${item.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : item.status === 'failed' ? 'bg-rose-600 text-white shadow-lg shadow-rose-200' : 'bg-indigo-100 text-indigo-700 animate-pulse'}`}>
                            {item.status === 'pending' && '대기중'}
                            {item.status === 'generating' && '생성중'}
                            {item.status === 'publishing' && '발행중'}
                            {item.status === 'completed' && '완료'}
                            {item.status === 'failed' && '실패'}
                          </span>
                          {item.scheduledDate && (
                            <span className="text-[10px] md:text-xs text-slate-400 font-bold">
                              <i className="fa-regular fa-clock mr-1"></i>
                              {new Date(item.scheduledDate).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 md:gap-3">
                        {item.status === 'failed' && <button onClick={() => retryItem(idx)} className="w-10 h-10 md:w-16 md:h-16 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-xl hover:bg-rose-600 active:scale-90 transition-all"><i className="fa-solid fa-rotate-right text-sm md:text-xl"></i></button>}
                        {item.result && <button onClick={() => setPreviewPost(item.result!)} className="w-10 h-10 md:w-14 md:h-14 bg-slate-900 text-white rounded-full flex items-center justify-center shadow-xl hover:bg-black transition-all"><i className="fa-solid fa-eye text-sm md:text-base"></i></button>}
                      </div>
                    </div>
                    {item.status === 'failed' && item.error && (
                      <div className="bg-white p-4 md:p-8 rounded-xl md:rounded-[2.2rem] border-2 border-rose-100 shadow-sm">
                        <p className="text-[9px] md:text-[11px] font-black text-rose-800 uppercase mb-2 md:mb-4 flex items-center gap-2 tracking-widest"><i className="fa-solid fa-circle-exclamation text-base md:text-lg"></i> 에러 상세</p>
                        <p className="text-[11px] md:text-[13px] font-bold text-slate-700 leading-relaxed whitespace-pre-wrap bg-slate-50 p-4 md:p-6 rounded-xl md:rounded-2xl border-l-4 md:border-l-8 border-rose-500">
                          {item.error}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 사이드바 */}
            <aside className="lg:col-span-4 space-y-4 md:space-y-8">
              {/* 현재 사이트 정보 */}
              <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl md:rounded-[3rem] p-4 md:p-8 text-white shadow-xl">
                <h3 className="text-[10px] md:text-xs font-black uppercase mb-2 md:mb-4 tracking-widest flex items-center gap-2 opacity-80">
                  <i className="fa-solid fa-globe"></i> 현재 사이트
                </h3>
                <p className="text-lg md:text-2xl font-black mb-1 md:mb-2 truncate">{currentProfile.name}</p>
                <p className="text-xs md:text-sm opacity-80 truncate">{currentProfile.config.siteUrl}</p>
                {currentProfile.config.defaultCategoryId && (
                  <p className="text-[10px] md:text-xs mt-2 md:mt-3 bg-white/20 px-2 md:px-3 py-1 rounded-full inline-block">
                    📁 카테고리 ID: {currentProfile.config.defaultCategoryId}
                  </p>
                )}
              </div>

              {/* API 키 상태 표시 */}
              {currentProfile.config.apiKeys && currentProfile.config.apiKeys.filter(k => k.trim()).length > 0 && (
                <div className="bg-white rounded-xl md:rounded-[3rem] p-4 md:p-8 shadow-lg md:shadow-xl border border-slate-100">
                  <h3 className="text-[10px] md:text-xs font-black text-slate-400 uppercase mb-3 md:mb-4 tracking-widest flex items-center gap-2">
                    <i className="fa-solid fa-key"></i> API 키 상태
                  </h3>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 md:w-10 md:h-10 bg-emerald-500 rounded-lg md:rounded-xl flex items-center justify-center text-white font-black text-sm md:text-base">
                      {(currentProfile.config.currentKeyIndex || 0) + 1}
                    </div>
                    <div>
                      <p className="text-xs md:text-sm font-bold text-slate-700">현재 활성 키: #{(currentProfile.config.currentKeyIndex || 0) + 1}</p>
                      <p className="text-[10px] md:text-xs text-slate-400">총 {currentProfile.config.apiKeys.filter(k => k.trim()).length}개 등록됨</p>
                    </div>
                  </div>
                </div>
              )}

              {/* 통계 */}
              <div className="bg-slate-900 rounded-xl md:rounded-[3.5rem] p-4 md:p-10 text-white shadow-2xl md:shadow-3xl lg:sticky lg:top-28 border border-white/5">
                <h3 className="text-[10px] md:text-xs font-black text-slate-500 uppercase mb-4 md:mb-8 tracking-widest flex items-center gap-2"><i className="fa-solid fa-chart-line"></i> 실시간 통합 통계</h3>
                <div className="grid gap-3 md:gap-6">
                  {[{ label: '발행 성공', val: stats.wpPublish, color: 'text-emerald-400', icon: 'fa-check' }, { label: '예약 완료', val: stats.wpFuture, color: 'text-indigo-400', icon: 'fa-clock' }, { label: '임시 저장', val: stats.wpDraft, color: 'text-amber-400', icon: 'fa-file-lines' }].map((s, i) => (
                    <div key={i} className="bg-slate-800/40 p-3 md:p-6 rounded-xl md:rounded-[2.2rem] flex items-center justify-between border border-white/5 hover:bg-slate-800/60 transition-all">
                      <div className="flex items-center gap-3 md:gap-4">
                        <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-slate-800 flex items-center justify-center ${s.color}`}><i className={`fa-solid ${s.icon} text-sm md:text-base`}></i></div>
                        <span className="text-[10px] md:text-xs font-black text-slate-300">{s.label}</span>
                      </div>
                      <span className={`text-2xl md:text-4xl font-black ${s.color}`}>{s.val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        ) : currentProfile && activeTab === 'manager' ? (
          <div className="grid gap-4 md:gap-6">
            {publishedPosts.length === 0 ? (
              <div className="bg-white rounded-xl md:rounded-[3rem] p-10 md:p-16 text-center">
                <i className="fa-solid fa-inbox text-4xl md:text-6xl text-slate-200 mb-4 md:mb-6"></i>
                <p className="text-slate-400 font-bold text-sm md:text-base">발행된 글이 없습니다</p>
              </div>
            ) : (
              publishedPosts.map(post => (
                <div key={post.id} className="bg-white p-4 md:p-8 rounded-xl md:rounded-[3.5rem] border-2 border-slate-50 flex items-center gap-4 md:gap-10 shadow-sm hover:shadow-xl md:hover:shadow-2xl transition-all cursor-pointer" onClick={() => setPreviewPost(post)}>
                  <div className="w-16 h-16 md:w-28 md:h-28 bg-slate-100 rounded-xl md:rounded-[2.5rem] overflow-hidden shadow-inner shrink-0">{post.featuredMediaUrl && <img src={post.featuredMediaUrl} className="w-full h-full object-cover" alt="" />}</div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-black text-slate-800 text-sm md:text-2xl mb-2 md:mb-3 truncate">{post.title}</h4>
                    <span className={`text-[9px] md:text-[11px] font-black px-3 md:px-6 py-1 md:py-2 rounded-full uppercase tracking-tighter shadow-sm ${post.status === 'publish' ? 'bg-emerald-100 text-emerald-600' :
                      post.status === 'future' ? 'bg-indigo-100 text-indigo-600' :
                        'bg-amber-100 text-amber-600'
                      }`}>{post.status === 'publish' ? '발행됨' : post.status === 'future' ? '예약됨' : '임시저장'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        profiles={appSettings.profiles}
        currentProfileId={appSettings.currentProfileId}
        onSaveProfile={saveProfile}
        onDeleteProfile={deleteProfile}
        onSwitchProfile={switchProfile}
      />

      <PreviewModal
        isOpen={!!previewPost}
        post={previewPost}
        onClose={() => setPreviewPost(null)}
      />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onLoginSuccess={() => {
          console.log('✅ 로그인 성공, 클라우드 동기화 활성화');
          setIsAuthOpen(false);
        }}
      />
    </div>
  );
};

export default App;
