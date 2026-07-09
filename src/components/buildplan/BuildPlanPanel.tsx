import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { subscribeFeatures, type Feature } from '../../lib/features'
import { subscribeIdeas, type Idea } from '../../lib/ideas'
import RoadmapTab from './RoadmapTab'
import IdeaParkingTab from './IdeaParkingTab'
import FeatureDetailPanel from './FeatureDetailPanel'
import IdeaDetailPanel from './IdeaDetailPanel'

type MainTab = 'roadmap' | 'ideas'

export default function BuildPlanPanel({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const [tab, setTab] = useState<MainTab>('roadmap')
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null)
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null)
  const [features, setFeatures] = useState<Feature[]>([])
  const [ideas, setIdeas] = useState<Idea[]>([])

  useEffect(() => {
    if (!user) return
    const unsub1 = subscribeFeatures(user.uid, setFeatures)
    const unsub2 = subscribeIdeas(user.uid, setIdeas)
    return () => {
      unsub1()
      unsub2()
    }
  }, [user])

  const selectedFeature = features.find((f) => f.id === selectedFeatureId) ?? null
  const selectedIdea = ideas.find((i) => i.id === selectedIdeaId) ?? null
  const currentFocusId = features.find((f) => f.isCurrentFocus)?.id ?? null

  const switchTab = (next: MainTab) => {
    setTab(next)
    setSelectedFeatureId(null)
    setSelectedIdeaId(null)
  }

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose}></div>

      <div className="absolute bottom-0 inset-x-0 max-h-[88vh] rounded-t-2xl md:top-0 md:bottom-0 md:right-0 md:left-auto md:inset-x-auto md:max-h-none md:h-full md:w-[640px] md:rounded-l-2xl md:rounded-t-none bg-surface shadow-2xl flex flex-col overflow-hidden">
        <div className="p-6 border-b border-outline-variant/20 flex-shrink-0">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-xl font-bold text-on-surface">Build Plan</h2>
              <p className="text-sm text-on-surface-variant">Growing Horizon</p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-surface-container-high hover:bg-surface-container-highest transition-colors"
            >
              <span className="material-symbols-outlined text-on-surface-variant">close</span>
            </button>
          </div>
          <div className="flex bg-surface-container-low rounded-full p-1 gap-1">
            <button
              onClick={() => switchTab('roadmap')}
              className={`flex-1 py-2 rounded-full text-sm font-bold transition-all ${
                tab === 'roadmap' ? 'bg-orange-500 text-white shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              Build Roadmap
            </button>
            <button
              onClick={() => switchTab('ideas')}
              className={`flex-1 py-2 rounded-full text-sm font-bold transition-all ${
                tab === 'ideas' ? 'bg-orange-500 text-white shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              Idea Parking
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {selectedFeature ? (
            <FeatureDetailPanel feature={selectedFeature} currentFocusId={currentFocusId} onBack={() => setSelectedFeatureId(null)} />
          ) : selectedIdea ? (
            <IdeaDetailPanel idea={selectedIdea} onBack={() => setSelectedIdeaId(null)} />
          ) : tab === 'roadmap' ? (
            <RoadmapTab onSelectFeature={setSelectedFeatureId} />
          ) : (
            <IdeaParkingTab onSelectIdea={setSelectedIdeaId} />
          )}
        </div>
      </div>
    </div>
  )
}
