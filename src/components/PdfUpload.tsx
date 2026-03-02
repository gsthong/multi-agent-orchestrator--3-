import { Upload, FileText } from 'lucide-react';
import React, { useState } from 'react';

export function PdfUpload({ onPdfUpload }: { onPdfUpload?: (file: File | null, text?: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setIsExtracting(true);
      
      try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const pdfjsLib = (window as any).pdfjsLib;
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map((item: any) => item.str).join(' ') + '\n';
        }
        onPdfUpload?.(selectedFile, text);
      } catch (err) {
        console.error("Error extracting PDF text:", err);
        onPdfUpload?.(selectedFile, "[⚠️ Some text may be malformed due to PDF extraction]");
      } finally {
        setIsExtracting(false);
      }
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-300 flex items-center gap-2">
          <FileText size={16} className="text-blue-400" />
          Document Context
        </span>
      </div>
      
      {!file ? (
        <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-zinc-800 border-dashed rounded-lg cursor-pointer bg-zinc-900/20 hover:bg-zinc-800/50 transition-colors">
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <Upload className="w-6 h-6 mb-2 text-zinc-500" />
            <p className="text-xs text-zinc-500">Click or drag PDF to upload</p>
          </div>
          <input type="file" className="hidden" accept=".pdf" onChange={handleFileChange} />
        </label>
      ) : (
        <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
          <div className="flex items-center gap-3 overflow-hidden">
            <FileText size={16} className="text-blue-400 shrink-0" />
            <span className="text-xs text-zinc-300 truncate">{file.name}</span>
            {isExtracting && <span className="text-[10px] text-blue-400 animate-pulse">Extracting...</span>}
          </div>
          <button onClick={() => { setFile(null); onPdfUpload?.(null); }} className="text-zinc-500 hover:text-red-400">
            &times;
          </button>
        </div>
      )}
    </div>
  );
}
