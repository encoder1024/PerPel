import { useEffect, useRef } from 'react';

/**
 * Hook to handle barcode scanner input (HID mode).
 * It listens for global keydown events and detects rapid sequences of characters
 * usually followed by an "Enter" key.
 * 
 * @param {Function} onScan - Callback function called with the scanned code.
 * @param {Object} options - Configuration options.
 */
export const useBarcodeScanner = (onScan, options = {}) => {
  const {
    timeLimit = 50, // Max milliseconds between characters
    minLength = 3,  // Minimum length for a valid barcode
    endKey = 'Enter' // Key that signals the end of a scan
  } = options;

  const buffer = useRef('');
  const lastKeyTime = useRef(0);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore modifier keys
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
        return;
      }

      const currentTime = Date.now();
      const diff = currentTime - lastKeyTime.current;

      if (e.key === endKey) {
        if (buffer.current.length >= minLength) {
          onScan(buffer.current);
        }
        buffer.current = '';
      } else {
        // If the timing is too slow, it's probably manual typing, clear buffer
        if (diff > timeLimit && buffer.current.length > 0) {
          buffer.current = '';
        }
        
        // Only append printable characters
        if (e.key.length === 1) {
          buffer.current += e.key;
        }
      }

      lastKeyTime.current = currentTime;
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onScan, timeLimit, minLength, endKey]);

  return null;
};
