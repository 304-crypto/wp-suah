import React, { useState, useEffect } from 'react';
import { WordPressConfig, SiteProfile } from '../types';
import { testWordPressConnection } from '../services/wordPressService';

// ═══════════════════════════════════════════════════════════
// 📋 Props 인터페이스
// ═══════════════════════════════════════════════════════════

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  profiles: SiteProfile[];
  currentProfileId: string | null;
  onSaveProfile: (profileId: string | null, name: string, config: WordPressConfig) => void;
  onDeleteProfile: (profileId: string) => void;
  onSwitchProfile: (profileId: string) => void;
}

// ═══════════════════════════════════════════════════════════
// 🎯 기본 설정값
// ═══════════════════════════════════════════════════════════

const DEFAULT_CONFIG: WordPressConfig = {
  siteUrl: '',
  username: '',
  applicationPassword: '',
  customInstruction: '',
  defaultCategoryId: '',
  enableAiImage: true,
  aiImageCount: 1,
  adCode1: '',
  adCode2: '',
  defaultStatus: 'draft',
  publishInterval: 30,
  startTime: new Date().toISOString().slice(0, 16),
  apiKeys: [],
  currentKeyIndex: 0
};

// ═══════════════════════════════════════════════════════════
// 🏠 설정 모달 컴포넌트
// ═══════════════════════════════════════════════════════════

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  profiles,
  currentProfileId,
  onSaveProfile,
  onDeleteProfile,
  onSwitchProfile
}) => {
  // 모바일 프로필 목록 표시 상태
  const [showProfileList, setShowProfileList] = useState(false);

  // 편집 중인 프로필
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [isNewProfile, setIsNewProfile] = useState(false);

  // 프로필 데이터
  const [profileName, setProfileName] = useState('');
  const [config, setConfig] = useState<WordPressConfig>(DEFAULT_CONFIG);

  // API 키 텍스트 (줄바꿈으로 입력)
  const [apiKeysText, setApiKeysText] = useState('');

  // 상태
  const [testStatus, setTestStatus] = useState<{ loading: boolean, msg: string, ok?: boolean }>({ loading: false, msg: '' });
  const [activeTab, setActiveTab] = useState<'wordpress' | 'apikeys' | 'ads'>('wordpress');

  // ═══════════════════════════════════════════════════════════
  // 📥 모달 열릴 때 초기화
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (isOpen) {
      setShowProfileList(false);
      if (profiles.length === 0) {
        startNewProfile();
      } else if (currentProfileId) {
        loadProfile(currentProfileId);
      } else if (profiles.length > 0) {
        loadProfile(profiles[0].id);
      }
      setTestStatus({ loading: false, msg: '' });
    }
  }, [isOpen, profiles, currentProfileId]);

  // ═══════════════════════════════════════════════════════════
  // 📂 프로필 불러오기
  // ═══════════════════════════════════════════════════════════
  const loadProfile = (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (profile) {
      setEditingProfileId(profileId);
      setIsNewProfile(false);
      setProfileName(profile.name);
      setConfig(profile.config);

      if (profile.config.apiKeys && profile.config.apiKeys.length > 0) {
        const text = profile.config.apiKeys
          .filter(k => k.trim().length > 0)
          .join('\n');
        setApiKeysText(text);
      } else {
        setApiKeysText('');
      }

      setShowProfileList(false);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // ➕ 새 프로필 시작
  // ═══════════════════════════════════════════════════════════
  const startNewProfile = () => {
    setEditingProfileId(null);
    setIsNewProfile(true);
    setProfileName('');
    setConfig(DEFAULT_CONFIG);
    setApiKeysText('');
    setActiveTab('wordpress');
    setShowProfileList(false);
  };

  // ═══════════════════════════════════════════════════════════
  // 🔗 연결 테스트
  // ═══════════════════════════════════════════════════════════
  const runTest = async () => {
    if (!config.siteUrl || !config.username || !config.applicationPassword) {
      setTestStatus({ loading: false, msg: "모든 항목을 채워주세요.", ok: false });
      return;
    }
    setTestStatus({ loading: true, msg: '연결 확인 중...' });
    const result = await testWordPressConnection(config);
    setTestStatus({ loading: false, msg: result.message, ok: result.ok });

    if (result.ok && !profileName && config.siteUrl) {
      try {
        const hostname = new URL(config.siteUrl).hostname;
        setProfileName(hostname);
      } catch { }
    }
  };

  // ═══════════════════════════════════════════════════════════
  // 💾 저장
  // ═══════════════════════════════════════════════════════════
  const handleSave = () => {
    const apiKeys = apiKeysText
      .split('\n')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    if (apiKeys.length === 0) {
      alert('API 키를 최소 1개 이상 입력해주세요!');
      setActiveTab('apikeys');
      return;
    }

    if (!config.siteUrl || !config.username || !config.applicationPassword) {
      alert('WordPress 연결 정보를 모두 입력해주세요!');
      setActiveTab('wordpress');
      return;
    }

    let finalName = profileName.trim();
    if (!finalName) {
      try {
        finalName = new URL(config.siteUrl).hostname;
      } catch {
        finalName = '새 사이트';
      }
    }

    const finalConfig: WordPressConfig = {
      ...config,
      apiKeys: apiKeys,
      currentKeyIndex: isNewProfile ? 0 : (config.currentKeyIndex || 0)
    };

    onSaveProfile(editingProfileId, finalName, finalConfig);
    onClose();
  };

  // ═══════════════════════════════════════════════════════════
  // 🗑️ 삭제
  // ═══════════════════════════════════════════════════════════
  const handleDelete = () => {
    if (!editingProfileId) return;
    if (!confirm(`"${profileName}" 사이트를 삭제하시겠습니까?`)) return;
    onDeleteProfile(editingProfileId);

    const remaining = profiles.filter(p => p.id !== editingProfileId);
    if (remaining.length > 0) {
      loadProfile(remaining[0].id);
    } else {
      startNewProfile();
    }
  };

  const validKeyCount = apiKeysText
    .split('\n')
    .filter(k => k.trim().length > 0).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xl flex items-center justify-center z-[600] p-2 md:p-4">
      <div className="bg-white rounded-2xl md:rounded-[3rem] shadow-2xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in-95 duration-300 max-h-[95vh] md:max-h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="p-4 md:p-8 flex justify-between items-center bg-slate-50/50 border-b shrink-0">
          <div className="flex items-center gap-3">
            {/* 모바일: 프로필 목록 토글 버튼 */}
            {profiles.length > 0 && (
              <button
                onClick={() => setShowProfileList(!showProfileList)}
                className="md:hidden w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center"
              >
                <i className={`fa-solid ${showProfileList ? 'fa-xmark' : 'fa-list'}`}></i>
              </button>
            )}
            <h2 className="text-lg md:text-2xl font-black text-slate-800 tracking-tighter">⚙️ 사이트 관리</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-full hover:bg-slate-100 transition-all text-slate-400">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden relative">
          {/* 좌측: 프로필 목록 (데스크탑 항상 표시, 모바일 토글) */}
          <div className={`
            ${showProfileList ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            absolute md:relative inset-0 md:inset-auto
            w-full md:w-64 bg-slate-50 border-r p-4 md:p-6 overflow-y-auto shrink-0
            transition-transform duration-300 z-10
          `}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">사이트 목록</h3>
              <button
                onClick={startNewProfile}
                className="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center hover:bg-indigo-700 transition-all shadow-md"
              >
                <i className="fa-solid fa-plus text-sm"></i>
              </button>
            </div>

            <div className="space-y-2">
              {/* 새 프로필 생성 모드 */}
              {isNewProfile && (
                <div className="p-3 md:p-4 bg-gradient-to-r from-indigo-100 to-purple-100 rounded-xl md:rounded-2xl border-2 border-indigo-300">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 md:w-10 md:h-10 bg-indigo-500 rounded-lg md:rounded-xl flex items-center justify-center text-white">
                      <i className="fa-solid fa-plus text-sm"></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-indigo-800 text-sm">새 사이트 추가</p>
                      <p className="text-xs text-indigo-600 truncate">설정을 입력해주세요</p>
                    </div>
                  </div>
                </div>
              )}

              {/* 기존 프로필 목록 */}
              {profiles.map(profile => (
                <button
                  key={profile.id}
                  onClick={() => loadProfile(profile.id)}
                  className={`w-full p-3 md:p-4 rounded-xl md:rounded-2xl text-left transition-all ${editingProfileId === profile.id && !isNewProfile
                    ? 'bg-white shadow-lg border-2 border-indigo-200'
                    : 'hover:bg-white/60 border-2 border-transparent'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center ${editingProfileId === profile.id && !isNewProfile
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-200 text-slate-500'
                      }`}>
                      <i className="fa-solid fa-globe text-sm"></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 text-sm truncate">{profile.name}</p>
                      <p className="text-xs text-slate-400 truncate">{profile.config.siteUrl}</p>
                    </div>
                  </div>
                </button>
              ))}

              {profiles.length === 0 && !isNewProfile && (
                <div className="text-center py-8 text-slate-400">
                  <i className="fa-solid fa-folder-open text-3xl mb-3"></i>
                  <p className="text-sm font-bold">사이트가 없습니다</p>
                </div>
              )}
            </div>

            {/* 모바일: 닫기 버튼 */}
            <button
              onClick={() => setShowProfileList(false)}
              className="md:hidden w-full mt-4 py-3 bg-slate-200 text-slate-600 rounded-xl font-bold text-sm"
            >
              닫기
            </button>
          </div>

          {/* 우측: 프로필 편집 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* 프로필명 + 현재 선택된 사이트 표시 (모바일) */}
            <div className="p-4 md:p-6 border-b bg-white shrink-0">
              {/* 모바일: 현재 선택된 프로필 표시 */}
              {!isNewProfile && editingProfileId && (
                <div className="md:hidden mb-3 flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400">편집 중:</span>
                  <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg truncate max-w-[200px]">
                    {profileName || '이름 없음'}
                  </span>
                </div>
              )}
              <label className="text-[10px] md:text-[11px] font-black text-slate-400 uppercase mb-2 block">사이트 이름</label>
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="예: 메인 블로그, credivita.com"
                className="w-full px-4 md:px-6 py-3 md:py-4 bg-slate-50 border-2 border-transparent rounded-xl md:rounded-2xl outline-none font-bold text-sm md:text-lg focus:border-indigo-100 focus:bg-white transition-all"
              />
            </div>

            {/* 탭 */}
            <div className="px-4 md:px-6 pt-3 md:pt-4 flex gap-1 md:gap-2 shrink-0 bg-white overflow-x-auto">
              {[
                { id: 'wordpress', label: '워드프레스', icon: 'fa-globe' },
                { id: 'apikeys', label: 'API 키', icon: 'fa-key', badge: validKeyCount },
                { id: 'ads', label: '광고 코드', icon: 'fa-rectangle-ad' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-3 md:px-5 py-2 md:py-3 rounded-xl md:rounded-2xl text-xs md:text-sm font-bold flex items-center gap-1.5 md:gap-2 transition-all whitespace-nowrap ${activeTab === tab.id
                    ? 'bg-indigo-600 text-white shadow-lg'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                >
                  <i className={`fa-solid ${tab.icon}`}></i>
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.label.substring(0, 2)}</span>
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className={`px-1.5 md:px-2 py-0.5 rounded-full text-[10px] md:text-xs font-black ${activeTab === tab.id ? 'bg-white/20' : 'bg-indigo-100 text-indigo-600'
                      }`}>{tab.badge}</span>
                  )}
                </button>
              ))}
            </div>

            {/* 컨텐츠 */}
            <div className="p-4 md:p-6 space-y-4 md:space-y-6 overflow-y-auto flex-1 bg-white">
              {/* 워드프레스 탭 */}
              {activeTab === 'wordpress' && (
                <div className="space-y-3 md:space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] md:text-[11px] font-black text-slate-400 ml-1 uppercase">사이트 주소</label>
                    <input type="url" placeholder="https://example.com" className="w-full px-4 md:px-6 py-3 md:py-4 bg-slate-50 border-2 border-transparent rounded-xl md:rounded-2xl outline-none font-bold text-sm focus:border-indigo-100 focus:bg-white transition-all shadow-inner" value={config.siteUrl} onChange={(e) => setConfig({ ...config, siteUrl: e.target.value })} />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] md:text-[11px] font-black text-slate-400 ml-1 uppercase">아이디</label>
                      <input type="text" placeholder="admin" className="w-full px-4 md:px-6 py-3 md:py-4 bg-slate-50 border-2 border-transparent rounded-xl md:rounded-2xl outline-none font-bold text-sm focus:border-indigo-100 focus:bg-white transition-all shadow-inner" value={config.username} onChange={(e) => setConfig({ ...config, username: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] md:text-[11px] font-black text-slate-400 ml-1 uppercase">앱 비밀번호</label>
                      <input type="password" placeholder="16자리 비밀번호" className="w-full px-4 md:px-6 py-3 md:py-4 bg-slate-50 border-2 border-transparent rounded-xl md:rounded-2xl outline-none font-bold text-sm focus:border-indigo-100 focus:bg-white transition-all shadow-inner" value={config.applicationPassword} onChange={(e) => setConfig({ ...config, applicationPassword: e.target.value })} />
                    </div>
                  </div>

                  {/* 카테고리 ID 입력 */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] md:text-[11px] font-black text-slate-400 ml-1 uppercase flex items-center gap-2">
                      <i className="fa-solid fa-folder text-indigo-400"></i>
                      기본 카테고리 ID (선택)
                    </label>
                    <input
                      type="text"
                      placeholder="예: 5 (워드프레스 카테고리 ID)"
                      className="w-full px-4 md:px-6 py-3 md:py-4 bg-slate-50 border-2 border-transparent rounded-xl md:rounded-2xl outline-none font-bold text-sm focus:border-indigo-100 focus:bg-white transition-all shadow-inner"
                      value={config.defaultCategoryId || ''}
                      onChange={(e) => setConfig({ ...config, defaultCategoryId: e.target.value })}
                    />
                    <p className="text-[10px] md:text-xs text-slate-400 ml-1">워드프레스 관리자 → 글 → 카테고리에서 ID를 확인하세요</p>
                  </div>

                  <button type="button" onClick={runTest} className="w-full py-4 md:py-5 bg-indigo-600 text-white rounded-xl md:rounded-2xl text-sm font-black shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95">
                    {testStatus.loading ? '확인하는 중...' : '🔗 연결 테스트'}
                  </button>

                  {testStatus.msg && (
                    <div className={`p-3 md:p-4 rounded-xl text-xs font-bold text-center ${testStatus.ok ? 'text-emerald-600 bg-emerald-50' : 'text-rose-500 bg-rose-50'}`}>
                      {testStatus.msg}
                    </div>
                  )}
                </div>
              )}

              {/* API 키 탭 */}
              {activeTab === 'apikeys' && (
                <div className="space-y-3 md:space-y-4">
                  <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-amber-200">
                    <p className="text-[10px] md:text-xs font-bold text-amber-800 flex items-center gap-2">
                      <i className="fa-solid fa-lightbulb text-amber-500"></i>
                      줄바꿈으로 여러 개 입력하세요! 할당량 소진 시 자동 전환됩니다.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] md:text-[11px] font-black text-slate-400 ml-1 uppercase flex items-center justify-between">
                      <span>Gemini API 키들</span>
                      <span className="text-indigo-600">{validKeyCount}개 등록됨</span>
                    </label>
                    <textarea
                      value={apiKeysText}
                      onChange={(e) => setApiKeysText(e.target.value)}
                      placeholder="AIzaSy... (첫번째 키)
AIzaSy... (두번째 키)

💡 한 줄에 하나씩 입력하세요!"
                      rows={6}
                      className="w-full p-4 md:p-5 bg-slate-50 border-2 border-transparent rounded-xl md:rounded-2xl font-mono text-xs outline-none focus:border-indigo-100 focus:bg-white transition-all shadow-inner resize-none"
                    />
                  </div>

                  <div className="bg-slate-50 p-3 md:p-4 rounded-xl md:rounded-2xl">
                    <p className="text-[10px] md:text-xs text-slate-500">
                      <span className="font-bold text-emerald-600">● 현재 활성:</span> 키 #{(config.currentKeyIndex || 0) + 1}
                      {validKeyCount > 0 && <span className="ml-2 md:ml-3">| 유효한 키: {validKeyCount}개</span>}
                    </p>
                  </div>

                  {/* 미리보기 */}
                  {validKeyCount > 0 && (
                    <div className="bg-indigo-50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-indigo-100">
                      <p className="text-[10px] md:text-xs font-bold text-indigo-800 mb-2">📋 입력된 키 미리보기:</p>
                      <div className="space-y-1">
                        {apiKeysText.split('\n').filter(k => k.trim().length > 0).slice(0, 3).map((key, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-[10px] md:text-xs">
                            <div className={`w-5 h-5 md:w-6 md:h-6 rounded-full flex items-center justify-center text-[10px] font-black ${idx === 0 ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                              {idx + 1}
                            </div>
                            <code className="text-slate-600 truncate">
                              {key.substring(0, 15)}...{key.substring(key.length - 4)}
                            </code>
                          </div>
                        ))}
                        {validKeyCount > 3 && (
                          <p className="text-[10px] md:text-xs text-slate-400 ml-7">...외 {validKeyCount - 3}개</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 광고 코드 탭 */}
              {activeTab === 'ads' && (
                <div className="space-y-3 md:space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] md:text-[11px] font-black text-slate-400 ml-1 uppercase">[AD1] 코드 - 서론 직후</label>
                    <textarea placeholder="구글 애드센스, 쿠팡파트너스 등" className="w-full h-24 md:h-28 p-3 md:p-4 bg-slate-50 border-2 border-transparent rounded-xl md:rounded-2xl font-mono text-xs outline-none focus:bg-white transition-all shadow-inner resize-none" value={config.adCode1} onChange={(e) => setConfig({ ...config, adCode1: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] md:text-[11px] font-black text-slate-400 ml-1 uppercase">[AD2] 코드 - 본문 중간</label>
                    <textarea placeholder="구글 애드센스, 쿠팡파트너스 등" className="w-full h-24 md:h-28 p-3 md:p-4 bg-slate-50 border-2 border-transparent rounded-xl md:rounded-2xl font-mono text-xs outline-none focus:bg-white transition-all shadow-inner resize-none" value={config.adCode2} onChange={(e) => setConfig({ ...config, adCode2: e.target.value })} />
                  </div>
                </div>
              )}
            </div>

            {/* 푸터 */}
            <div className="p-4 md:p-6 bg-slate-50/50 border-t shrink-0 flex gap-2 md:gap-4">
              {/* 삭제 버튼 (기존 프로필만) */}
              {editingProfileId && !isNewProfile && (
                <button
                  onClick={handleDelete}
                  className="px-4 md:px-6 py-3 md:py-4 bg-rose-100 text-rose-600 rounded-xl md:rounded-2xl font-bold text-xs md:text-sm hover:bg-rose-200 transition-all"
                >
                  <i className="fa-solid fa-trash"></i>
                  <span className="hidden sm:inline ml-2">삭제</span>
                </button>
              )}

              <button onClick={handleSave} className="flex-1 py-3 md:py-4 bg-slate-900 text-white rounded-xl md:rounded-2xl font-black text-sm md:text-lg hover:bg-black transition-all shadow-xl">
                💾 {isNewProfile ? '사이트 추가' : '저장'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
