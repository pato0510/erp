'use client';

import { use } from 'react';
import { AssetFolderView } from '../../../../../../components/operations/AssetFolderView';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function EquipoCarpetaPage({ params }: PageProps) {
  const { id } = use(params);
  return <AssetFolderView assetId={id} assetKind="equipo" />;
}
