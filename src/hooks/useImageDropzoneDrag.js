import { useCallback, useRef, useState } from "react";

export function useImageDropzoneDrag() {
  const [isDragging, setIsDragging] = useState(false);
  const imageDragDepthRef = useRef(0);

  const isImageDrag = useCallback((event) => {
    const types = Array.from(event.dataTransfer?.types || []);
    return types.includes("Files");
  }, []);

  const handleImageDropzoneDragEnter = useCallback(
    (event) => {
      if (!isImageDrag(event)) return;
      event.preventDefault();
      imageDragDepthRef.current += 1;
      setIsDragging(true);
    },
    [isImageDrag],
  );

  const handleImageDropzoneDragOver = useCallback(
    (event) => {
      if (!isImageDrag(event)) return;
      event.preventDefault();
      setIsDragging(true);
    },
    [isImageDrag],
  );

  const handleImageDropzoneDragLeave = useCallback(
    (event) => {
      if (!isImageDrag(event)) return;
      event.preventDefault();
      imageDragDepthRef.current = Math.max(0, imageDragDepthRef.current - 1);
      if (imageDragDepthRef.current === 0) {
        setIsDragging(false);
      }
    },
    [isImageDrag],
  );

  const handleImageDropzoneDrop = useCallback(
    (event) => {
      if (!isImageDrag(event)) return;
      event.preventDefault();
      imageDragDepthRef.current = 0;
      setIsDragging(false);
    },
    [isImageDrag],
  );

  return {
    isDragging,
    imageDragDepthRef,
    handleImageDropzoneDragEnter,
    handleImageDropzoneDragOver,
    handleImageDropzoneDragLeave,
    handleImageDropzoneDrop,
  };
}
