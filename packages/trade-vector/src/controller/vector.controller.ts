import { Inject, Controller, Post, Body, Put, Del } from '@midwayjs/core';
import { QdrantService } from '../service/qdrant.service';

@Controller('/api')
export class VectorController {
  @Inject()
  qdrantService: QdrantService;

  /**
   * Add or update vectors.
   * Example body: {
   *   "points": [
   *     { "id": "a1b2c3d4", "vector": { "a": [0.1, 0.2, 0.3], "b": [0.4, 0.5, 0.6] }, "payload": { "source": "indicator_x" } },
   *     { "id": "e5f6g7h8", "vector": { "a": [0.7, 0.8, 0.9], "b": [0.1, 0.2, 0.3] }, "payload": { "source": "indicator_y" } }
   *   ]
   * }
   */
  @Post('/vectors')
  async addVectors(@Body('points') points: any[]) {
    if (!points || !Array.isArray(points) || points.length === 0) {
      return { success: false, message: 'Points must be a non-empty array.' };
    }
    const result = await this.qdrantService.addPoints(points);
    return { success: true, result };
  }

  /**
   * Update a point's payload (metadata).
   * Example body: {
   *   "id": "a1b2c3d4",
   *   "payload": { "source": "indicator_x_updated", "last_checked": "2025-08-13" }
   * }
   */
  @Put('/vectors')
  async updateVectorPayload(@Body('id') id: string, @Body('payload') payload: any) {
    if (!id || !payload) {
      return { success: false, message: 'Point ID and payload are required.' };
    }
    const result = await this.qdrantService.updatePointPayload(id, payload);
    return { success: true, result };
  }

  /**
   * Delete vectors by IDs.
   * Example body: {
   *   "ids": ["a1b2c3d4", "e5f6g7h8"]
   * }
   */
  @Del('/vectors')
  async deleteVectors(@Body('ids') ids: string[]) {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return { success: false, message: 'IDs must be a non-empty array.' };
    }
    const result = await this.qdrantService.deletePoints(ids);
    return { success: true, result };
  }
}
