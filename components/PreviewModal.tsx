
import React from 'react';
import { GeneratedPost } from '../types';

interface PreviewModalProps {
    isOpen: boolean;
    post: GeneratedPost | null;
    onClose: () => void;
}

const PreviewModal: React.FC<PreviewModalProps> = ({ isOpen, post, onClose }) => {
    if (!isOpen || !post) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl flex items-center justify-center z-[700] p-6" onClick={onClose}>
            <div
                className="bg-white rounded-[3rem] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-300 flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* 헤더 */}
                <div className="p-8 flex justify-between items-center bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                            <i className="fa-solid fa-eye text-xl"></i>
                        </div>
                        <div>
                            <h2 className="text-xl font-black tracking-tight">콘텐츠 미리보기</h2>
                            <p className="text-sm text-white/70 mt-1">{post.status === 'draft' ? '임시저장' : post.status === 'future' ? '예약발행' : '발행완료'}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/10 transition-all text-white/80 hover:text-white"
                    >
                        <i className="fa-solid fa-xmark text-2xl"></i>
                    </button>
                </div>

                {/* 본문 스크롤 영역 */}
                <div className="flex-1 overflow-y-auto p-10">
                    {/* 썸네일 */}
                    {post.featuredMediaUrl && (
                        <div className="mb-8 flex justify-center">
                            <img
                                src={post.featuredMediaUrl}
                                alt={post.title}
                                className="w-64 h-64 object-cover rounded-3xl shadow-2xl border-4 border-slate-100"
                            />
                        </div>
                    )}

                    {/* 제목 */}
                    <h1 className="text-3xl font-black text-slate-800 text-center mb-6 leading-tight">
                        {post.title}
                    </h1>

                    {/* 요약 */}
                    {post.excerpt && (
                        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-6 rounded-2xl mb-8 border-l-4 border-indigo-500">
                            <p className="text-sm font-bold text-indigo-700 mb-2 uppercase tracking-widest">요약</p>
                            <p className="text-slate-600 leading-relaxed">{post.excerpt}</p>
                        </div>
                    )}

                    {/* 본문 HTML */}
                    <div className="border-t pt-8">
                        <div
                            className="prose prose-lg max-w-none prose-headings:font-black prose-headings:text-slate-800 prose-p:text-slate-600 prose-a:text-indigo-600"
                            dangerouslySetInnerHTML={{ __html: post.content }}
                        />
                    </div>
                </div>

                {/* 푸터 */}
                <div className="p-6 bg-slate-50 border-t flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <span className={`px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-widest ${post.status === 'publish' ? 'bg-emerald-100 text-emerald-700' :
                                post.status === 'future' ? 'bg-indigo-100 text-indigo-700' :
                                    'bg-amber-100 text-amber-700'
                            }`}>
                            {post.status === 'publish' ? '발행완료' : post.status === 'future' ? '예약발행' : '임시저장'}
                        </span>
                        {post.date && (
                            <span className="text-sm text-slate-400 font-bold">
                                {new Date(post.date).toLocaleString('ko-KR', {
                                    year: 'numeric', month: '2-digit', day: '2-digit',
                                    hour: '2-digit', minute: '2-digit'
                                })}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black hover:bg-black transition-all shadow-lg"
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PreviewModal;
