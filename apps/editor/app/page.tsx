'use client'

import { t } from '@pascal-app/editor/i18n'
import { Editor, ItemsPanel, type SceneGraph } from '@pascal-app/editor'
import { PascalWebXRButton } from '@webxr/plugin/pascal-editor'
import { Hammer, Layers, Package, Palette, Settings } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { BuildTab } from '@/components/build-tab'
import { PaintPanel } from '@/components/paint-panel'
import {
  CommunityViewerToolbarLeft,
  CommunityViewerToolbarRight,
} from '@/components/viewer-toolbar'
import {
  useWebXRInstalled,
  WebXRFeatureConsumer,
  WebXRFeatureRuntime,
} from '@/components/webxr-feature-gate'

// The open-source editor only ships the built-in catalog (no uploaded items),
// so the Library/Community/Mine source chips and tag filters add nothing —
// drop them and keep the panel to plain categories.
function EditorItemsPanel() {
  return <ItemsPanel showSourceFilter={false} showTagFilters={false} />
}

// 静的版（GitHub Pages）にはシーン一覧ページが無いため、案内バナーを出さない
const IS_STATIC_EXPORT = process.env.NEXT_PUBLIC_PASCAL_STATIC === '1'

const SIDEBAR_TABS = [
  {
    id: 'site',
    label: 'Scene',
    component: () => null,
    mobileDefaultSnap: 0.5,
    mobileIcon: <Layers className="h-5 w-5" />,
    icon: (
      <Image
        alt=""
        className="h-8 w-8 object-contain"
        height={32}
        src="/icons/scene.webp"
        width={32}
      />
    ),
  },
  {
    id: 'build',
    label: 'Build',
    component: BuildTab,
    mobileDefaultSnap: 0.5,
    mobileIcon: <Hammer className="h-5 w-5" />,
    icon: (
      <Image
        alt=""
        className="h-8 w-8 object-contain"
        height={32}
        src="/icons/build.webp"
        width={32}
      />
    ),
  },
  {
    id: 'paint',
    label: 'Paint',
    component: PaintPanel,
    mobileDefaultSnap: 0.5,
    mobileIcon: <Palette className="h-5 w-5" />,
    icon: (
      <Image
        alt=""
        className="h-8 w-8 object-contain"
        height={32}
        src="/icons/paint.webp"
        width={32}
      />
    ),
  },
  {
    id: 'items',
    label: 'Items',
    component: EditorItemsPanel,
    mobileDefaultSnap: 0.5,
    mobileIcon: <Package className="h-5 w-5" />,
    icon: (
      <Image
        alt=""
        className="h-8 w-8 object-contain"
        height={32}
        src="/icons/couch.webp"
        width={32}
      />
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    component: () => null,
    mobileDefaultSnap: 0.5,
    mobileIcon: <Settings className="h-5 w-5" />,
    icon: (
      <Image
        alt=""
        className="h-8 w-8 object-contain"
        height={32}
        src="/icons/settings.webp"
        width={32}
      />
    ),
  },
]

const PROJECT_ID = 'local-editor'

interface WorkspaceProps {
  projectId?: string
  /** 指定すると、保存先を localStorage ではなく呼び出し側に任せる（静的版の複数シーン用）。 */
  onLoad?: () => Promise<SceneGraph | null>
  onSave?: (graph: SceneGraph, options?: { keepalive?: boolean }) => Promise<void>
  /** 画面上部中央に出す案内。指定しなければ従来の案内（静的版では「保存した間取り」への入口）。 */
  overlay?: React.ReactNode
}

export function Workspace({ projectId = PROJECT_ID, onLoad, onSave, overlay }: WorkspaceProps) {
  const webXRInstalled = useWebXRInstalled()
  return (
    <div className="relative h-screen w-screen">
      <WebXRFeatureRuntime enabled={webXRInstalled}>
        <WebXRFeatureConsumer>
          {(vr) => (
            <>
              {overlay === undefined && projectId === 'local-editor' && !IS_STATIC_EXPORT && (
                <div className="pointer-events-none absolute top-14 left-1/2 z-40 -translate-x-1/2">
                  <div className="pointer-events-none flex max-w-[min(92vw,42rem)] flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border border-border/60 bg-background/90 px-4 py-1.5 text-xs shadow-sm backdrop-blur">
                    <span className="text-muted-foreground">
                      Blank canvas — saved scenes are under Scenes (not this page).
                    </span>
                    <Link prefetch={false}
                      className="pointer-events-auto font-medium text-foreground hover:underline"
                      href="/scenes"
                    >
                      Open saved scenes
                    </Link>
                  </div>
                </div>
              )}
              {overlay === undefined && projectId === 'local-editor' && IS_STATIC_EXPORT && (
                <div className="pointer-events-none absolute top-14 left-1/2 z-40 -translate-x-1/2">
                  <Link prefetch={false}
                    className="pointer-events-auto rounded-full border border-border bg-background/90 px-4 py-1.5 font-medium text-xs shadow-sm backdrop-blur hover:bg-accent/40"
                    href="/scenes"
                  >
                    {t('Open saved scenes')}
                  </Link>
                </div>
              )}
              {overlay}
              <Editor
                immersive={vr?.session ? vr.immersive : undefined}
                layoutVersion="v2"
                onLoad={onLoad}
                onSave={onSave}
                projectId={projectId}
                sidebarTabs={SIDEBAR_TABS}
                viewerToolbarLeft={<CommunityViewerToolbarLeft />}
                viewerToolbarRight={
                  <CommunityViewerToolbarRight
                    vrButton={
                      vr ? (
                        <PascalWebXRButton
                          className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:bg-accent disabled:opacity-50"
                          feature={vr}
                        />
                      ) : null
                    }
                    vrLabel="Enter VR"
                  />
                }
              />
            </>
          )}
        </WebXRFeatureConsumer>
      </WebXRFeatureRuntime>
    </div>
  )
}

export default function Home() {
  return <Workspace />
}
