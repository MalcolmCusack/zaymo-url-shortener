import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';

// const MAX_HTML_BYTES = Number(process.env.MAX_HTML_BYTES || String(5 * 1024 * 1024)); // default 5 MiB

type Props = {
  nameFile?: string;
  nameTextarea?: string;
};

export default function HtmlUploader({ nameFile = 'html', nameTextarea = 'pasted' }: Props) {
  const [pastedHtml, setPastedHtml] = useState('');
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [bytes, setBytes] = useState<number>(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // create the text encoder
  const enc = useMemo(() => new TextEncoder(), []);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles[0]) {
      const file = acceptedFiles[0];
      setSelectedFileName(file.name);
      try {
        const text = await file.text();
        setPastedHtml(text);
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'text/html': ['.html', '.htm'] },
    multiple: false,
    onDrop,
    // maxSize: MAX_HTML_BYTES,
    maxFiles: 1,
    onError: (error) => {
      console.error(error);
    },
  });

  useEffect(() => {
    setBytes(enc.encode(pastedHtml).length);
  }, [enc, pastedHtml]);

  const isHard = bytes >= 200 * 1024;
  const isSoft = !isHard && bytes >= 102 * 1024;

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setPastedHtml(text);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="bg-white rounded-xl p-4 shadow space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">Add your HTML</label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handlePasteFromClipboard} className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
            Paste from clipboard
          </button>
        </div>
      </div>

      <div
        {...getRootProps({
          className:
            'mt-1 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center ' +
            (isDragActive ? 'bg-indigo-50 border-indigo-400' : 'bg-gray-50 hover:bg-gray-100'),
        })}
      >
        <input {...getInputProps()} name={nameFile} />
        <div className="text-gray-700">
          <p className="font-medium">Drag & drop an HTML file here</p>
          <p className="text-sm text-gray-500">or click to browse. You can also paste below.</p>
          {selectedFileName && <p className="mt-2 text-sm text-gray-600">Selected: {selectedFileName}</p>}
        </div>
      </div>

      <div>
        <input type="hidden" name={nameTextarea} value={pastedHtml} />
        <textarea
          ref={textareaRef}
          name={nameTextarea + '_display'}
          rows={10}
          className="mt-2 w-full rounded-lg border p-3 font-mono text-sm"
          placeholder="Paste your HTML here..."
          value={pastedHtml}
          onChange={(e) => setPastedHtml(e.target.value)}
        />
        <div className="mt-2 text-sm">
          <span className="text-gray-600">Size: {(bytes / 1024).toFixed(1)} KB</span>
          <span
            className={
              'ml-3 ' +
              (isHard ? 'text-red-600' : isSoft ? 'text-amber-600' : 'text-gray-500')
            }
          >
            {isHard ? '⚠ Gmail will clip (≥200 KB)' : isSoft ? 'Heads up: large (≥102 KB)' : 'Looks good'}
          </span>
        </div>
      </div>
    </div>
  );
}


