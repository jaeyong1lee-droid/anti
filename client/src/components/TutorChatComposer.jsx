import React, { forwardRef, memo, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Paperclip, Send } from 'lucide-react';

const THEME_CONFIG = {
  violet: {
    formFocus: 'focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500/20',
    inputText: 'text-sm',
    submitButton: 'bg-slate-300 hover:bg-slate-200 disabled:hover:bg-slate-300 shadow-slate-300/10',
    sendIcon: 'text-slate-900',
  },
  indigo: {
    formFocus: 'focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/20',
    inputText: 'text-xs',
    submitButton: 'bg-indigo-600 hover:bg-indigo-500 disabled:hover:bg-indigo-600 shadow-indigo-600/10',
    sendIcon: 'text-white',
  },
};

/**
 * Isolated chat composer for the AI tutor sidebars so typing only re-renders
 * the input box rather than the entire top-level App tree.
 */
export const TutorChatComposer = memo(forwardRef(function TutorChatComposer(
  {
    theme = 'violet',
    placeholder = '기술사 용어나 개념 질문...',
    isLoading = false,
    hasAttachedImages = false,
    inputValueRef,
    fileInputRef,
    onSubmit,
    onImageAttach,
    onPasteImage,
  },
  ref
) {
  const [draft, setDraft] = useState(() => inputValueRef?.current || '');
  const textareaRef = useRef(null);
  const internalFileInputRef = useRef(null);
  const targetFileRef = fileInputRef || internalFileInputRef;
  const styles = THEME_CONFIG[theme] || THEME_CONFIG.violet;

  const reset = useCallback(() => {
    setDraft('');
    if (inputValueRef) {
      inputValueRef.current = '';
    }
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [inputValueRef]);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    reset,
  }), [reset]);

  const submitCurrent = useCallback(() => {
    if (isLoading) return;
    const currentText = (inputValueRef ? inputValueRef.current : draft) || '';
    if (!currentText.trim() && !hasAttachedImages) return;
    onSubmit?.();
  }, [draft, hasAttachedImages, inputValueRef, isLoading, onSubmit]);

  const handleFormSubmit = useCallback((e) => {
    e.preventDefault();
    submitCurrent();
  }, [submitCurrent]);

  const handleChange = useCallback((e) => {
    const nextVal = e.target.value;
    if (inputValueRef) {
      inputValueRef.current = nextVal;
    }
    setDraft(nextVal);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
  }, [inputValueRef]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent?.isComposing) {
      e.preventDefault();
      submitCurrent();
    }
  }, [submitCurrent]);

  return (
    <form
      onSubmit={handleFormSubmit}
      className={`bg-slate-800/80 border border-slate-700/80 rounded-2xl p-2 flex items-center gap-1 transition-all shadow-lg ${styles.formFocus}`}
    >
      <button
        type="button"
        onClick={() => targetFileRef.current?.click()}
        disabled={isLoading}
        className="w-8 h-8 hover:bg-slate-700/50 text-slate-400 hover:text-slate-200 rounded-xl flex items-center justify-center transition-all cursor-pointer active:scale-95 flex-shrink-0"
        title="이미지 첨부"
      >
        <Paperclip size={13} />
      </button>
      <input
        type="file"
        ref={targetFileRef}
        onChange={onImageAttach}
        accept="image/*"
        multiple
        className="hidden"
      />

      <div className="flex-grow">
        <textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={onPasteImage}
          placeholder={placeholder}
          disabled={isLoading}
          className={`w-full bg-transparent border-0 p-1 ${styles.inputText} text-white placeholder-slate-500 focus:outline-none focus:ring-0 resize-none`}
        />
      </div>

      <button
        type="submit"
        disabled={(!draft.trim() && !hasAttachedImages) || isLoading}
        className={`w-8 h-8 ${styles.submitButton} disabled:opacity-30 rounded-xl flex items-center justify-center transition-all cursor-pointer shadow-md active:scale-95 flex-shrink-0`}
      >
        <Send size={12} className={styles.sendIcon} />
      </button>
    </form>
  );
}));
