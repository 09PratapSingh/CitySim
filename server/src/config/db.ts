/**
 * Dual-Mode Database Connection Manager.
 * 
 * VIVA DEFENSE & RELIABILITY DESIGN:
 * In university examinations or offline evaluations, a local or remote MongoDB
 * instance may not be running. To guarantee that the application never fails
 * to launch during a presentation, this module attempts a timed connection
 * to MongoDB via Mongoose. If MongoDB is unavailable, it gracefully activates
 * an In-Memory Store fallback without throwing unhandled exceptions.
 */

import mongoose from 'mongoose';

let isConnected = false;

export async function connectDB(uri?: string): Promise<boolean> {
  const mongoUri = uri || process.env.MONGODB_URI;

  if (!mongoUri) {
    console.log('ℹ️  No MONGODB_URI configured. Running in Resilient In-Memory Mode.');
    isConnected = false;
    return false;
  }

  try {
    // 2.5 second timeout to prevent server hanging if MongoDB daemon is offline
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 2500,
    });
    isConnected = true;
    console.log('✅ Connected to MongoDB successfully.');
    return true;
  } catch (err: any) {
    console.warn(
      `⚠️  MongoDB connection failed (${err.message}). Activating Resilient In-Memory Mode.`
    );
    isConnected = false;
    return false;
  }
}

export function isDBConnected(): boolean {
  return isConnected && mongoose.connection.readyState === 1;
}

export async function disconnectDB(): Promise<void> {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
  }
}
