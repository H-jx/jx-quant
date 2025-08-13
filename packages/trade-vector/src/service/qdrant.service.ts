import { Provide, Inject, Init, Config } from '@midwayjs/core';
import { QdrantClient } from '@qdrant/js-client-rest';
import type { ILogger } from '@midwayjs/logger';

@Provide()
export class QdrantService {
  @Inject()
  logger: ILogger;

  @Config('qdrant')
  qdrantConfig;

  private client: QdrantClient;
  private collectionName = 'financial-indicators';

  @Init()
  async init() {
    this.client = new QdrantClient({ 
      url: this.qdrantConfig.url,
      apiKey: this.qdrantConfig.apiKey,
     });

    await this.createCollectionIfNotExists();
  }

  private async createCollectionIfNotExists() {
    try {
      const result = await this.client.getCollections();
      const collectionExists = result.collections.some(
        c => c.name === this.collectionName
      );

      if (!collectionExists) {
        this.logger.info(`Collection '${this.collectionName}' not found, creating...`);
        // Example: Define multiple named vectors. Adjust dimensions as needed.
        await this.client.createCollection(this.collectionName, {
          vectors: {
            a: {
              size: 3,
              distance: 'Cosine',
            },
            b: {
              size: 3,
              distance: 'Euclid',
            },
          },
        });
        this.logger.info(`Collection '${this.collectionName}' created successfully.`);
      } else {
        this.logger.info(`Collection '${this.collectionName}' already exists.`);
      }
    } catch (error) {
      this.logger.error('Error initializing Qdrant collection:', error);
      throw error;
    }
  }

  async addPoints(points: any[]) {
    return this.client.upsert(this.collectionName, {
      wait: true,
      points,
    });
  }

  async updatePointPayload(pointId: string, payload: any) {
    return this.client.setPayload(this.collectionName, {
      wait: true,
      payload,
      points: [pointId],
    });
  }

  async deletePoints(pointIds: string[]) {
    return this.client.delete(this.collectionName, {
      points: pointIds,
    });
  }

  async getClient(): Promise<QdrantClient> {
    return this.client;
  }
}
