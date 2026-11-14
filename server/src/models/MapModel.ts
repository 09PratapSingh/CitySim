import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import type { MapData } from '../types.ts';

export interface IMapDocument extends MapData, Document {}

const MapSchema = new Schema<IMapDocument>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    nodes: { type: [Schema.Types.Mixed], default: [] },
    edges: { type: [Schema.Types.Mixed], default: [] },
    odPairs: { type: [Schema.Types.Mixed], default: [] },
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

export const MapModel = mongoose.model<IMapDocument>('Map', MapSchema);
