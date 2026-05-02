import { FileText, Image as ImageIcon, File } from 'lucide-react';

export function AtomTypeIcon({ atomType, className }: { atomType?: string; className?: string }) {
  switch (atomType) {
    case 'image': return <ImageIcon className={className} />;
    case 'file': return <File className={className} />;
    default: return <FileText className={className} />;
  }
}
