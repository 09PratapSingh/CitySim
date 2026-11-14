import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import type { ScenarioData } from '../types.ts';

export interface IScenarioDocument extends ScenarioData, Document {}

const ScenarioSchema = new Schema<IScenarioDocument>(
  {
    baseMapId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    seed: { type: Number, default: 42 },
    demandMultiplier: { type: Number, default: 1.0 },
    modifications: {
      closedEdgeIds: { type: [String], default: [] },
      signalOverrides: { type: [Schema.Types.Mixed], default: [] },
      speedLimitOverrides: { type: [Schema.Types.Mixed], default: [] },
    },
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

export const ScenarioModel = mongoose.model<IScenarioDocument>('Scenario', ScenarioSchema);
