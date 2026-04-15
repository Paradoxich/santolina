'use client'

import { useEffect } from 'react'
import { usePlantStore } from '@/store/plantStore'
import type { Plant } from '@/types/plant'

/**
 * Hook to access and interact with the plant store.
 * Extends with any async data fetching logic here.
 */
export function usePlants() {
  const {
    plants,
    isLoading,
    error,
    setPlants,
    addPlant,
    updatePlant,
    removePlant,
  } = usePlantStore()

  // Placeholder: fetch plants from Supabase on mount
  useEffect(() => {
    // TODO: replace with actual Supabase fetch
    const mockPlants: Plant[] = []
    setPlants(mockPlants)
  }, [setPlants])

  return { plants, isLoading, error, addPlant, updatePlant, removePlant }
}
