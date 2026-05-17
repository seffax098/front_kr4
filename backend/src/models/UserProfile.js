const { mongoose } = require('../db/mongo');
const { unixNow } = require('../utils/time');

const userProfileSchema = new mongoose.Schema(
  {
    sqlUserId: {
      type: Number,
      required: true,
      unique: true,
      index: true
    },
    contacts: {
      email: String,
      phone: String,
      telegram: String
    },
    interests: [String],
    preferences: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {}
    },
    notes: String,
    sourceServer: String,
    created_at: {
      type: Number,
      default: unixNow
    },
    updated_at: {
      type: Number,
      default: unixNow
    }
  },
  {
    strict: false,
    collection: 'user_profiles'
  }
);

userProfileSchema.pre('save', function updateUnixTimestamps(next) {
  const now = unixNow();
  if (this.isNew && !this.created_at) this.created_at = now;
  this.updated_at = now;
  next();
});

function cleanProfile(document) {
  if (!document) return null;
  const profile = document.toObject({ versionKey: false, flattenMaps: true });
  profile.id = String(profile._id);
  delete profile._id;
  return profile;
}

module.exports = {
  UserProfile: mongoose.model('UserProfile', userProfileSchema),
  cleanProfile
};
