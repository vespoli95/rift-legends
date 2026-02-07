import { useEffect, useRef, useState } from "react";

const EMOJIS = [
  "⚔️", "🎮", "👑", "💎", "🔥", "🎯",
  "🏆", "⭐", "🐉", "🦁", "🐺", "🦅",
  "🌟", "💀", "🛡️", "⚡", "🎪", "🎭",
  "💪", "🤝", "🌈", "✨", "🚀", "💥",
  "🎸", "🐍", "🦊", "🐻", "🦈", "🎲",
  "🍆", "🍑", "💩", "🤡", "👻", "🧠",
];

interface EmojiPickerProps {
  name: string;
  defaultValue?: string;
  onChange?: (emoji: string) => void;
}

export function EmojiPicker({ name, defaultValue, onChange }: EmojiPickerProps) {
  const [selected, setSelected] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function select(emoji: string) {
    setSelected(emoji);
    setOpen(false);
    onChange?.(emoji);
  }

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={selected} />
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-xl leading-none hover:border-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600"
      >
        {selected || (
          <span className="text-base text-gray-400 dark:text-gray-500">+</span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 grid w-64 grid-cols-6 gap-1 rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                select(emoji);
              }}
              className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded text-lg hover:bg-indigo-50 dark:hover:bg-indigo-950 ${
                emoji === selected
                  ? "bg-indigo-100 dark:bg-indigo-900"
                  : ""
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
