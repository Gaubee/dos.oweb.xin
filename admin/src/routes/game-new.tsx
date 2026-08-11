// 新增游戏页：多 Tab 容器（DOS 游戏 + PlayCanvas 游戏）。
// 复用 GameEditPage（新增模式）和 GameUploadPage，embedded 去掉它们的外壳标题。
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/tabs';
import { PackingGuide } from '@/components/packing-guide';
import { GameEditPage } from './game-edit';
import { GameUploadPage } from './game-upload';

export function GameNewPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => void navigate({ to: '/games' })}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">新增游戏</h1>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          {
            label: 'DOS 游戏',
            content: (
              <div className="space-y-4">
                <PackingGuide engine="dos" />
                <GameEditPage embedded />
              </div>
            ),
          },
          {
            label: 'PlayCanvas 游戏',
            content: (
              <div className="space-y-4">
                <PackingGuide engine="playcanvas" />
                <GameUploadPage embedded />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
