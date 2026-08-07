import React, { useRef, useState, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, Maximize } from 'lucide-react';

const SvgZoomModal = ({ svgContent, onClose }) => {
  const containerRef = useRef(null);
  
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  
  // Touch variables
  const isDragging = useRef(false);
  const startDragPos = useRef({ x: 0, y: 0 });
  const startPosition = useRef({ x: 0, y: 0 });
  
  const pinchStartDistance = useRef(0);
  const pinchStartScale = useRef(1);

  // Stop body scroll when mounted
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Utility to calculate distance between two touch points
  const getDistance = (touches) => {
    return Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY
    );
  };

  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      // Pinch start
      pinchStartDistance.current = getDistance(e.touches);
      pinchStartScale.current = scale;
      isDragging.current = false;
    } else if (e.touches.length === 1) {
      // Pan start
      isDragging.current = true;
      startDragPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      startPosition.current = { ...position };
    }
  };

  const handleTouchMove = (e) => {
    // We only prevent default on the container if we are actively pinching or panning to stop scrolling
    if (e.cancelable) e.preventDefault();

    if (e.touches.length === 2) {
      // Pinch move
      const dist = getDistance(e.touches);
      const zoomFactor = dist / pinchStartDistance.current;
      let newScale = pinchStartScale.current * zoomFactor;
      newScale = Math.min(Math.max(newScale, 0.5), 5); // Limit scale 0.5x to 5x
      setScale(newScale);
    } else if (e.touches.length === 1 && isDragging.current) {
      // Pan move
      const dx = e.touches[0].clientX - startDragPos.current.x;
      const dy = e.touches[0].clientY - startDragPos.current.y;
      setPosition({
        x: startPosition.current.x + dx,
        y: startPosition.current.y + dy
      });
    }
  };

  const handleTouchEnd = (e) => {
    if (e.touches.length < 2) {
      pinchStartDistance.current = 0;
    }
    if (e.touches.length === 0) {
      isDragging.current = false;
    }
  };

  // Mouse Wheel for desktop users
  const handleWheel = (e) => {
    e.preventDefault();
    const zoomSensitivity = 0.001;
    let newScale = scale - e.deltaY * zoomSensitivity;
    newScale = Math.min(Math.max(newScale, 0.5), 5);
    setScale(newScale);
  };

  // Mouse drag for desktop users
  const handleMouseDown = (e) => {
    isDragging.current = true;
    startDragPos.current = { x: e.clientX, y: e.clientY };
    startPosition.current = { ...position };
  };

  const handleMouseMove = (e) => {
    if (!isDragging.current) return;
    const dx = e.clientX - startDragPos.current.x;
    const dy = e.clientY - startDragPos.current.y;
    setPosition({
      x: startPosition.current.x + dx,
      y: startPosition.current.y + dy
    });
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const resetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const zoomIn = () => setScale(s => Math.min(s * 1.2, 5));
  const zoomOut = () => setScale(s => Math.max(s / 1.2, 0.5));

  return (
    <div className="fixed inset-0 z-[1000] bg-black/90 backdrop-blur-sm flex flex-col animate-fade-in touch-none">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-slate-900/50 border-b border-slate-800">
        <h3 className="text-slate-200 font-bold flex items-center gap-2">
          <span className="text-amber-400">📊</span> 다이어그램 확대
        </h3>
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Workspace */}
      <div 
        ref={containerRef}
        className="flex-1 relative overflow-hidden flex items-center justify-center select-none cursor-move"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div 
          className="will-change-transform origin-center transition-transform duration-75 flex items-center justify-center [&>svg]:w-[90vw] [&>svg]:max-w-[800px] [&>svg]:h-auto"
          style={{ 
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          }}
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      </div>

      {/* Controls */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-800/80 backdrop-blur px-4 py-2 rounded-full border border-slate-700 shadow-xl">
        <button onClick={zoomOut} className="p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-full transition-colors">
          <ZoomOut size={20} />
        </button>
        <span className="w-12 text-center text-xs font-mono text-emerald-400 font-bold">
          {Math.round(scale * 100)}%
        </span>
        <button onClick={zoomIn} className="p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-full transition-colors">
          <ZoomIn size={20} />
        </button>
        <div className="w-px h-6 bg-slate-600 mx-1"></div>
        <button onClick={resetZoom} className="p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-full transition-colors" title="원래 크기로">
          <Maximize size={20} />
        </button>
      </div>
    </div>
  );
};

export default SvgZoomModal;
