import React, { useState } from 'react';
import { Img } from 'remotion';

// <Img> de Remotion annule TOUT le rendu quand un fichier manque (image
// effacée du disque, sticker ou outro supprimés du studio). Ici, après les
// nouvelles tentatives de Remotion, l'image est simplement retirée : le fond
// sombre de la scène reste visible et le MP4 va jusqu'au bout.
export const SafeImg = (props) => {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return null;
  }
  return (
    <Img
      {...props}
      onError={() => {
        console.warn(`Image introuvable, plan rendu sans elle : ${props.src}`);
        setFailed(true);
      }}
    />
  );
};
