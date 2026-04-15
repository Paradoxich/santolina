'use server'

import type { Plant } from '@/types/plant'

/**
 * Server action: create a new plant record.
 * TODO: Wire up to Supabase.
 */
export async function createPlant(
  data: Omit<Plant, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Plant> {
  const now = new Date()
  const plant: Plant = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  }
  // TODO: persist to Supabase
  return plant
}

/**
 * Server action: delete a plant by ID.
 * TODO: Wire up to Supabase.
 */
export async function deletePlant(id: string): Promise<{ success: boolean }> {
  // TODO: delete from Supabase
  return { success: true }
}
