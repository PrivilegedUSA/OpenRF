package org.openrf.app.data

import kotlinx.coroutines.flow.Flow

interface ObservationRepository {
    val observations: Flow<List<Observation>>
    suspend fun add(observation: Observation)
    suspend fun delete(observation: Observation)
}

class RoomObservationRepository(private val dao: ObservationDao) : ObservationRepository {
    override val observations = dao.all()
    override suspend fun add(observation: Observation) { dao.insert(observation) }
    override suspend fun delete(observation: Observation) { dao.delete(observation) }
}
