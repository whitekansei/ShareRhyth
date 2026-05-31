import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SongSelectScreen } from './screens/SongSelect/SongSelectScreen';
import { GameplayScreen } from './screens/Gameplay/GameplayScreen';
import { ResultScreen } from './screens/Result/ResultScreen';
import { EditorScreen } from './screens/Editor/EditorScreen';

export const App: React.FC = () => (
  <MemoryRouter initialEntries={['/']}>
    <Routes>
      <Route path="/" element={<SongSelectScreen />} />
      <Route path="/play" element={<GameplayScreen />} />
      <Route path="/result" element={<ResultScreen />} />
      <Route path="/editor" element={<EditorScreen />} />
    </Routes>
  </MemoryRouter>
);
