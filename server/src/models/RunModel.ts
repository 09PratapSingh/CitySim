import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import type { RunData } from '../types.ts';

export interface IRunDocument extends RunData, Document {}

const RunSchema = new Schema<IRunDocument>(
  {
    scenarioId: { type: String, default: null },
    baseMapId: { type: String, required: true },
    scenarioName: { type: String, default: 'Default Scenario' },
    seed: { type: Number, required: true },
    durationSeconds: { type: Number, required: true },
    aggregateMetrics: { type: Schema.Types.Mixed, required: true },
    timeSeries: { type: [Schema.Types.Mixed], default: [] },
    roadCongestion: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ['completed', 'failed'], default: 'completed' },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, any>) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

export const RunModel = mongoose.model<IRunDocument>('SimulationRun', RunSchema);
