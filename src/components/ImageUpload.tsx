import { Image as ImageIcon, Upload } from 'lucide-react';
import React, { useState } from 'react';

export function ImageUpload({ onImageUpload }: { onImageUpload?: (file: File) => void }) {
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      onImageUpload?.(selectedFile);
    }
  };

  return (
    <div className="space-y-2 mt-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-300 flex items-center gap-2">
          <ImageIcon size={16} className="text-purple-400" />
          Image Context
        </span>
      </div>
      
      {!file ? (
        <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-zinc-800 border-dashed rounded-lg cursor-pointer bg-zinc-900/20 hover:bg-zinc-800/50 transition-colors">
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <Upload className="w-6 h-6 mb-2 text-zinc-500" />
            <p className="text-xs text-zinc-500">Click or drag Image</p>
          </div>
          <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
        </label>
      ) : (
        <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
          <div className="flex items-center gap-3 overflow-hidden">
            <ImageIcon size={16} className="text-purple-400 shrink-0" />
            <span className="text-xs text-zinc-300 truncate">{file.name}</span>
          </div>
          <button onClick={() => { setFile(null); onImageUpload?.(null as any); }} className="text-zinc-500 hover:text-red-400">
            &times;
          </button>
        </div>
      )}
    </div>
  );
}
