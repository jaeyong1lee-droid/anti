import React, { useEffect, useState, useRef } from 'react';
import ReactDOM from 'react-dom';

export const PopoutWindow = ({ title, onClose, children, initWidth = 720, initHeight = 650 }) => {
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
      windowRef.current.document.title = title;
    }
  }, [title]);

  useEffect(() => {
    const newWindow = window.open(
      '',
      '_blank',
      `popup=yes,width=${initWidth},height=${initHeight},resizable=yes`
    );

    if (!newWindow) {
      alert('팝업 차단이 활성화되어 있습니다. 브라우저 설정에서 팝업을 허용해주세요.');
      if (onCloseRef.current) onCloseRef.current();
      return;
    }

    windowRef.current = newWindow;
    newWindow.document.title = title;

    const appContainer = newWindow.document.createElement('div');
    // Standard classes to maintain theme
    appContainer.className = 'w-full h-full min-h-screen bg-slate-950 text-slate-100 flex flex-col p-4 overflow-auto';
    newWindow.document.body.appendChild(appContainer);
    newWindow.document.body.style.margin = '0';
    newWindow.document.body.style.backgroundColor = '#020617';

    // Copy style and link tags from main document head, skipping script tags to prevent crash
    const srcHead = document.head;
    const destHead = newWindow.document.head;

    Array.from(srcHead.querySelectorAll('link[rel="stylesheet"]')).forEach((link) => {
      const newLink = newWindow.document.createElement('link');
      Array.from(link.attributes).forEach(attr => {
        newLink.setAttribute(attr.name, attr.value);
      });
      destHead.appendChild(newLink);
    });

    Array.from(srcHead.querySelectorAll('style')).forEach((style) => {
      const newStyle = newWindow.document.createElement('style');
      newStyle.innerHTML = style.innerHTML;
      destHead.appendChild(newStyle);
    });

    setContainer(appContainer);

    const handleUnload = () => {
      if (onCloseRef.current) onCloseRef.current();
    };
    newWindow.addEventListener('beforeunload', handleUnload);

    const handleParentUnload = () => {
      if (newWindow && !newWindow.closed) {
        newWindow.close();
      }
    };
    window.addEventListener('beforeunload', handleParentUnload);

    return () => {
      window.removeEventListener('beforeunload', handleParentUnload);
      if (newWindow && !newWindow.closed) {
        newWindow.removeEventListener('beforeunload', handleUnload);
        newWindow.close();
      }
    };
  }, []); // Run ONLY once on mount!

  if (!container) return null;

  return ReactDOM.createPortal(children, container);
};
