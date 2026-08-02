import React from 'react';

export const BufferedInput = React.memo(({ value, onChange, onKeystroke, onKeyDown, ...props }) => {
  const [localVal, setLocalVal] = React.useState(value || '');
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (typeof document !== 'undefined' && document.activeElement === inputRef.current) {
      return;
    }
    setLocalVal(value || '');
  }, [value]);

  const handleBlur = () => {
    if (onChange && localVal !== value) {
      onChange(localVal);
    }
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setLocalVal(val);
    if (onKeystroke) {
      onKeystroke(val);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (onChange && localVal !== value) {
        onChange(localVal);
      }
    }
    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  return (
    <input
      {...props}
      ref={inputRef}
      value={localVal}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      spellCheck={false}
    />
  );
});

export const BufferedTextarea = React.memo(({ value, onChange, onKeystroke, onKeyDown, onInput, className, ...props }) => {
  const [localVal, setLocalVal] = React.useState(value || '');
  const textareaRef = React.useRef(null);

  const adjustHeight = React.useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 26)}px`;
  }, []);

  React.useEffect(() => {
    if (typeof document !== 'undefined' && document.activeElement === textareaRef.current) {
      return;
    }
    setLocalVal(value || '');
  }, [value]);

  React.useLayoutEffect(() => {
    adjustHeight();
  }, [localVal, adjustHeight]);

  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    let lastWidth = el.clientWidth;
    adjustHeight();

    let resizeObserver = null;
    if (typeof window !== 'undefined' && 'ResizeObserver' in window) {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const newWidth = entry.contentRect.width;
          if (Math.abs(newWidth - lastWidth) > 0.5) {
            lastWidth = newWidth;
            requestAnimationFrame(() => {
              adjustHeight();
            });
          }
        }
      });
      resizeObserver.observe(el);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [adjustHeight]);

  const handleBlur = () => {
    if (onChange && localVal !== value) {
      onChange(localVal);
    }
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setLocalVal(val);
    if (onKeystroke) {
      onKeystroke(val);
    }
  };

  const handleInput = (e) => {
    adjustHeight();
    if (onInput) {
      onInput(e);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (onChange && localVal !== value) {
        onChange(localVal);
      }
    }
    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  return (
    <textarea
      {...props}
      ref={textareaRef}
      value={localVal}
      onChange={handleChange}
      onInput={handleInput}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={`overflow-hidden resize-none ${className || ''}`}
      spellCheck={false}
    />
  );
});
