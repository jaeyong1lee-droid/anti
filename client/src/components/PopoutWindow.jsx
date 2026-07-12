import React, { useEffect, useState, useRef } from 'react';
import ReactDOM from 'react-dom';

export const PopoutWindow = ({ title, onClose, children, initWidth = 720, initHeight = 650, storageKey }) => {
  const [container, setContainer] = useState(null);
  const windowRef = useRef(null);
  const onCloseRef = useRef(onClose);

  // Keep onClose callback up-to-date
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Keep window title up-to-date without reopening the window
  useEffect(() => {
    if (windowRef.current) {
      try {
        windowRef.current.document.title = title;
      } catch (e) {}
    }
  }, [title]);

  useEffect(() => {
    // 1. Load saved window bounds from localStorage if available
    let savedPos = null;
    if (storageKey) {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          savedPos = JSON.parse(saved);
        } catch (e) {}
      }
    }

    const w = (savedPos && savedPos.w) ? savedPos.w : initWidth;
    const h = (savedPos && savedPos.h) ? savedPos.h : initHeight;
    
    // Centering fallback relative to main window if no coordinates saved
    const defaultLeft = window.screenX + (window.outerWidth - w) / 2;
    const defaultTop = window.screenY + (window.outerHeight - h) / 2;
    const x = (savedPos && savedPos.x !== undefined) ? savedPos.x : defaultLeft;
    const y = (savedPos && savedPos.y !== undefined) ? savedPos.y : defaultTop;

    const features = `popup=yes,left=${Math.round(x)},screenX=${Math.round(x)},top=${Math.round(y)},screenY=${Math.round(y)},width=${Math.round(w)},height=${Math.round(h)},resizable=yes`;
    
    let newWindow = null;
    try {
      // Try opening as empty first to prevent reloading existing window
      newWindow = window.open(
        '',
        storageKey || '_blank',
        features
      );
    } catch (e) {
      console.warn('Failed to reference window via empty url:', e);
    }

    if (!newWindow) {
      // Fallback to direct URL if empty url failed
      try {
        newWindow = window.open(
          '/popout.html',
          storageKey || '_blank',
          features
        );
      } catch (e) {
        console.error('Failed to open popout window:', e);
      }
    }

    if (!newWindow) {
      alert('팝업 차단이 활성화되어 있습니다. 브라우저 설정에서 팝업을 허용해주세요.');
      if (onCloseRef.current) onCloseRef.current();
      return;
    }

    // Determine if the window is newly opened or already navigated
    let isNew = false;
    try {
      if (!newWindow.location || newWindow.location.href === 'about:blank' || newWindow.location.pathname === 'blank') {
        isNew = true;
      }
    } catch (e) {
      // Cross-origin restriction might happen if it was on a different page, treat as new
      isNew = true;
    }

    if (isNew) {
      newWindow.location.href = '/popout.html';
    }

    windowRef.current = newWindow;

    const setupContainer = () => {
      try {
        const doc = newWindow.document;
        doc.title = title;

        let root = doc.getElementById('popout-root');
        if (!root) {
          root = doc.createElement('div');
          root.id = 'popout-root';
          doc.body.appendChild(root);
        }

        // Ensure html, body, and root have full height and overflow hidden to allow inner scrolling
        doc.documentElement.style.height = '100%';
        doc.documentElement.style.overflow = 'hidden';

        doc.body.style.margin = '0';
        doc.body.style.padding = '0';
        doc.body.style.width = '100%';
        doc.body.style.height = '100%';
        doc.body.style.overflow = 'hidden';
        doc.body.style.backgroundColor = '#020617';

        root.style.width = '100%';
        root.style.height = '100%';
        root.style.overflow = 'hidden';

        // Copy style and link tags from main document head, skipping script tags to prevent crash
        const srcHead = document.head;
        const destHead = doc.head;

        // Clear existing stylesheet links/styles in case they were copied/duplicated
        destHead.querySelectorAll('link[rel="stylesheet"], style').forEach(el => el.remove());

        Array.from(srcHead.querySelectorAll('link[rel="stylesheet"]')).forEach((link) => {
          const newLink = doc.createElement('link');
          Array.from(link.attributes).forEach(attr => {
            newLink.setAttribute(attr.name, attr.value);
          });
          destHead.appendChild(newLink);
        });

        Array.from(srcHead.querySelectorAll('style')).forEach((style) => {
          const newStyle = doc.createElement('style');
          newStyle.innerHTML = style.innerHTML;
          destHead.appendChild(newStyle);
        });

        setContainer(root);
      } catch (err) {
        console.error('Error setting up popout container:', err);
      }
    };

    // Wait for the window to load
    let isCleanedUp = false;
    let checkInterval = null;

    const onWindowLoad = () => {
      if (isCleanedUp) return;
      setupContainer();
    };

    newWindow.addEventListener('load', onWindowLoad);
    
    // Fallback: poll because window.open with local files might already be loaded or fast
    checkInterval = setInterval(() => {
      try {
        if (newWindow.document && newWindow.document.readyState === 'complete') {
          clearInterval(checkInterval);
          setupContainer();
        }
      } catch (e) {
        // Handle cross-origin exception if it's transient
      }
    }, 50);

    const handleUnload = () => {
      if (onCloseRef.current) onCloseRef.current();
    };
    newWindow.addEventListener('beforeunload', handleUnload);

    // Keep active track of the window's position and bounds
    let lastPosition = { x, y, w, h };

    // Polling check to detect if the popout window was closed by the user
    const closeCheckInterval = setInterval(() => {
      if (newWindow) {
        if (newWindow.closed) {
          clearInterval(closeCheckInterval);
          // Save the last known position/size to localStorage
          if (storageKey) {
            localStorage.setItem(storageKey, JSON.stringify(lastPosition));
          }
          if (onCloseRef.current) {
            onCloseRef.current();
          }
        } else {
          try {
            // Track position and size while the window is active
            const curX = newWindow.screenX !== undefined ? newWindow.screenX : newWindow.screenLeft;
            const curY = newWindow.screenY !== undefined ? newWindow.screenY : newWindow.screenTop;
            const curW = newWindow.outerWidth;
            const curH = newWindow.outerHeight;
            
            // Only update if they are valid numbers and window is not minimized (screenX/Y could be -32000 on Windows when minimized)
            if (curX !== undefined && curY !== undefined && curW && curH && curX > -10000 && curY > -10000) {
              lastPosition = { x: curX, y: curY, w: curW, h: curH };
            }
          } catch (e) {
            // Ignore cross-origin error if it arises
          }
        }
      }
    }, 200);

    let isParentUnloading = false;
    const handleParentUnload = () => {
      isParentUnloading = true;
    };
    window.addEventListener('beforeunload', handleParentUnload);

    return () => {
      isCleanedUp = true;
      if (checkInterval) clearInterval(checkInterval);
      if (closeCheckInterval) clearInterval(closeCheckInterval);
      window.removeEventListener('beforeunload', handleParentUnload);
      
      // Only close the child window if the parent is NOT reloading/unloading (e.g. normal React unmount)
      if (newWindow && !newWindow.closed && !isParentUnloading) {
        newWindow.removeEventListener('beforeunload', handleUnload);
        newWindow.removeEventListener('load', onWindowLoad);
        newWindow.close();
      }
    };
  }, []); // Run ONLY once on mount!

  if (!container) return null;

  return ReactDOM.createPortal(children, container);
};
