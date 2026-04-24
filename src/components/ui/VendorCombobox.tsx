import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search } from 'lucide-react';

interface Vendor {
  id: string;
  name: string;
}

interface VendorComboboxProps {
  vendors: Vendor[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
}

export default function VendorCombobox({ vendors, value, onChange, placeholder = 'No supplier assigned yet', className = '' }: VendorComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sorted = [...vendors].sort((a, b) => a.name.localeCompare(b.name, 'th', { sensitivity: 'base' }));

  const filtered = query.trim().length === 0
    ? sorted
    : sorted.filter(v => v.name.toLowerCase().includes(query.toLowerCase()));

  const selected = vendors.find(v => v.id === value);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleOpen() {
    setOpen(true);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleSelect(id: string) {
    onChange(id);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={handleOpen}
        className="w-full flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 text-left"
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown size={14} className="text-gray-400 shrink-0 ml-2" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
            <Search size={13} className="text-gray-400 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Type to search..."
              className="flex-1 text-sm outline-none bg-transparent placeholder-gray-400"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto">
            <li
              className="px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 cursor-pointer"
              onClick={() => handleSelect('')}
            >
              {placeholder}
            </li>
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400 text-center">No results</li>
            ) : (
              filtered.map(v => (
                <li
                  key={v.id}
                  onClick={() => handleSelect(v.id)}
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-[#1D9E75]/5 ${v.id === value ? 'bg-[#1D9E75]/10 font-medium text-[#1D9E75]' : 'text-gray-800'}`}
                >
                  {v.name}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
