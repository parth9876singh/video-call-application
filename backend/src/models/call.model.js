import mongoose from 'mongoose';

const callSchema = new mongoose.Schema(
  {
    caller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Caller user ID is required'],
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Receiver user ID is required'],
    },
    status: {
      type: String,
      enum: {
        values: ['ringing', 'accepted', 'rejected', 'missed', 'ended', 'failed'],
        message: '{VALUE} is not a valid call status',
      },
      required: [true, 'Call status is required'],
      default: 'ringing',
    },
    startedAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    duration: {
      type: Number, // duration in seconds
      default: 0,
      min: [0, 'Duration cannot be negative'],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
// Optimized for listing call logs for a specific user (either as caller or receiver) sorted by time
callSchema.index({ caller: 1, createdAt: -1 });
callSchema.index({ receiver: 1, createdAt: -1 });

// Composite status + timer index for clearing stale active calls if necessary
callSchema.index({ status: 1, createdAt: 1 });

const Call = mongoose.model('Call', callSchema);

export default Call;
