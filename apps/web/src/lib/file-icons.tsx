import { File as FileIcon, FileSpreadsheet, FileText, Image as ImageIcon } from 'lucide-react';

interface IconProps {
  size?: number;
  className?: string;
}

/* Maps a MIME type to a colored lucide icon. Used by document lists,
   the upload modal and the preview header so the icon is consistent
   wherever a document is displayed. */
export function getFileIcon(mimeType: string, props: IconProps = {}) {
  const size = props.size ?? 16;
  const className = props.className ?? '';

  if (mimeType === 'application/pdf') {
    return <FileText size={size} className={className} style={{ color: '#dc2626' }} />;
  }
  if (mimeType.startsWith('image/')) {
    return <ImageIcon size={size} className={className} style={{ color: '#2563eb' }} />;
  }
  if (
    mimeType === 'application/msword' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return <FileText size={size} className={className} style={{ color: '#2563eb' }} />;
  }
  if (
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return <FileSpreadsheet size={size} className={className} style={{ color: '#16a34a' }} />;
  }
  return <FileIcon size={size} className={className} style={{ color: '#64748b' }} />;
}

/* Whether the file can be rendered inline in the preview modal. PDFs render
   in <iframe>, images in <img>; everything else falls back to a "download
   to view" placeholder. */
export function canPreviewInline(mimeType: string): 'pdf' | 'image' | 'none' {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  return 'none';
}
