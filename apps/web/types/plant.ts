export type PlantStatus = 'healthy' | 'needs-water' | 'critical' | 'dormant'

export interface Plant {
  id: string
  name: string
  species?: string
  imageUrl?: string
  status: PlantStatus
  lastWatered?: Date
  wateringIntervalDays: number
  notes?: string
  createdAt: Date
  updatedAt: Date
}

export interface WateringLog {
  id: string
  plantId: string
  wateredAt: Date
  notes?: string
}
