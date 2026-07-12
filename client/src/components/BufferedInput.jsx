import React from 'react';

export const BufferedInput = React.memo(({ value, onChange, onKeystroke, onKeyDown, ...props }) => {
  const [localVal, setLocalVal] = React.useState(value || '');

  React.useEffect(() => {
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
      value={localVal}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      spellCheck={false}
    />
  );
});

export const BufferedTextarea = React.memo(({ value, onChange, onKeystroke, onKeyDown, ...props }) => {
  const [localVal, setLocalVal] = React.useState(value || '');
  const textareaRef = React.useRef(null);

  React.useEffect(() => {
    setLocalVal(value || '');
  }, [value]);

  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    let lastWidth = el.clientWidth;

    const adjustHeight = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };

    // Run on mount / value change
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
  }, [localVal]);

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
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      spellCheck={false}
    />
  );
});
