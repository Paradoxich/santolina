import { create } from 'zustand'
import type { Plant } from '@/types/plant'

interface PlantStore {
  plants: Plant[]
  isLoading: boolean
  error: string | null

  setPlants: (plants: Plant[]) => void
  addPlant: (plant: Plant) => void
  updatePlant: (id: string, updates: Partial<Plant>) => void
  removePlant: (id: string) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const usePlantStore = create<PlantStore>((set) => ({
  plants: [],
  isLoading: false,
  error: null,

  setPlants: (plants) => set({ plants }),

  addPlant: (plant) => set((state) => ({ plants: [...state.plants, plant] })),

  updatePlant: (id, updates) =>
    set((state) => ({
      plants: state.plants.map((p) =>
        p.id === id ? { ...p, ...updates, updatedAt: new Date() } : p
      ),
    })),

  removePlant: (id) =>
    set((state) => ({
      plants: state.plants.filter((p) => p.id !== id),
    })),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),
}))
