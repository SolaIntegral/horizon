import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { subscribeFeatures, type Feature } from '../../lib/features'
import RoadmapTab from './RoadmapTab'
import FeatureDetailPanel from './FeatureDetailPanel'

export default function BuildPlanPanel({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null)
  const [features, setFeatures] = useState<Feature[]>([])

  useEffect(() => {
    if (!user) return
    return subscribeFeatures(user.uid, setFeatures)
  }, [user])

  const selectedFeature = features.find((f) => f.id === selectedFeatureId) ?? null
  const currentFocusId = features.find((f) => f.isCurrentFocus)?.id ?? null

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose}></div>

      <div className="absolute bottom-0 inset-x-0 max-h-[88vh] rounded-t-2xl md:top-0 md:bottom-0 md:right-0 md:left-auto md:inset-x-auto md:max-h-none md:h-full md:w-[640px] md:rounded-l-2xl md:rounded-t-none bg-surface shadow-2xl flex flex-col overflow-hidden">
        <div className="p-6 border-b border-outline-variant/20 flex-shrink-0">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-on-surface">Build Roadmap</h2>
              <p className="text-sm text-on-surface-variant">Growing Horizon</p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-surface-container-high hover:bg-surface-container-highest transition-colors"
            >
              <span className="material-symbols-outlined text-on-surface-variant">close</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {selectedFeature ? (
            <FeatureDetailPanel feature={selectedFeature} currentFocusId={currentFocusId} onBack={() => setSelectedFeatureId(null)} />
          ) : (
            <RoadmapTab onSelectFeature={setSelectedFeatureId} />
          )}
        </div>
      </div>
    </div>
  )
}
