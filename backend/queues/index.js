const { Queue, Worker, QueueScheduler } = require('bullmq');
const { getRedisClient, isRedisConnected, REDIS_CONFIG } = require('../config/redis');

const QUEUE_NAMES = {
  EMAIL: 'email-notifications',
  VIDEO: 'video-processing',
  AI: 'ai-tasks',
  CLEANUP: 'cleanup-tasks',
  NOTIFICATIONS: 'push-notifications',
};

const queues = {};
const workers = {};

function getQueueConnection() {
  // تعطيل الطوابير في بيئة التطوير لتوفير طلبات Redis (Upstash limit)
  // في الإنتاج، BullMQ سيعمل تلقائياً
  if (process.env.DISABLE_QUEUES === 'true' || process.env.NODE_ENV !== 'production') {
    console.warn('⚠️ BullMQ: Queues disabled (enable in production only)');
    return null;
  }
  
  const redisUrl = process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn('⚠️ BullMQ: Redis not configured, queues disabled');
    return null;
  }
  
  try {
    const url = new URL(redisUrl);
    // Validate hostname is not empty or generic
    if (!url.hostname || url.hostname === 'base' || url.hostname.length < 3) {
      console.warn('⚠️ BullMQ: Invalid Redis URL hostname, queues disabled');
      return null;
    }
    
    return {
      connection: {
        host: url.hostname,
        port: parseInt(url.port) || 6379,
        password: url.password || undefined,
        tls: redisUrl.startsWith('rediss://') ? {} : undefined,
        maxRetriesPerRequest: null,
      }
    };
  } catch (err) {
    console.warn('⚠️ BullMQ: Failed to parse Redis URL:', err.message);
    return null;
  }
}

function createQueue(name) {
  const config = getQueueConnection();
  if (!config) return null;

  if (!queues[name]) {
    queues[name] = new Queue(name, config);
    console.log(`✅ Queue created: ${name}`);
  }
  return queues[name];
}

function createWorker(name, processor, options = {}) {
  const config = getQueueConnection();
  if (!config) return null;

  if (!workers[name]) {
    workers[name] = new Worker(name, processor, {
      ...config,
      concurrency: options.concurrency || 5,
      limiter: options.limiter || { max: 100, duration: 60000 },
    });

    workers[name].on('completed', (job) => {
      console.log(`✅ Job ${job.id} completed in queue ${name}`);
    });

    workers[name].on('failed', (job, err) => {
      console.error(`❌ Job ${job?.id} failed in queue ${name}:`, err.message);
    });

    console.log(`✅ Worker created for queue: ${name}`);
  }
  return workers[name];
}

const emailQueue = {
  async add(type, data, options = {}) {
    const queue = createQueue(QUEUE_NAMES.EMAIL);
    if (!queue) {
      console.log('📧 Email queue disabled, processing immediately');
      return processEmailImmediately(type, data);
    }
    return queue.add(type, data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      ...options,
    });
  },
};

const videoQueue = {
  async add(type, data, options = {}) {
    const queue = createQueue(QUEUE_NAMES.VIDEO);
    if (!queue) {
      console.log('🎬 Video queue disabled, processing immediately');
      return processVideoImmediately(type, data);
    }
    return queue.add(type, data, {
      attempts: 2,
      backoff: { type: 'fixed', delay: 5000 },
      ...options,
    });
  },
};

const aiQueue = {
  async add(type, data, options = {}) {
    const queue = createQueue(QUEUE_NAMES.AI);
    if (!queue) {
      console.log('🤖 AI queue disabled, processing immediately');
      return null;
    }
    return queue.add(type, data, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 3000 },
      priority: options.priority || 5,
      ...options,
    });
  },
};

const cleanupQueue = {
  async add(type, data, options = {}) {
    const queue = createQueue(QUEUE_NAMES.CLEANUP);
    if (!queue) return null;
    return queue.add(type, data, {
      attempts: 1,
      ...options,
    });
  },
};

async function processEmailImmediately(type, data) {
  console.log(`📧 Processing email immediately: ${type}`, data);
  return { success: true, processed: 'immediate' };
}

async function processVideoImmediately(type, data) {
  console.log(`🎬 Processing video immediately: ${type}`, data);
  return { success: true, processed: 'immediate' };
}

function initializeWorkers() {
  const config = getQueueConnection();
  if (!config) {
    console.log('⚠️ BullMQ workers not started - Redis not configured');
    return;
  }

  createWorker(QUEUE_NAMES.EMAIL, async (job) => {
    console.log(`📧 Processing email job: ${job.name}`, job.data);
    return { sent: true };
  });

  createWorker(QUEUE_NAMES.VIDEO, async (job) => {
    console.log(`🎬 Processing video job: ${job.name}`, job.data);
    return { processed: true };
  });

  createWorker(QUEUE_NAMES.CLEANUP, async (job) => {
    console.log(`🧹 Processing cleanup job: ${job.name}`, job.data);
    return { cleaned: true };
  });

  console.log('✅ All BullMQ workers initialized');
}

async function closeAllQueues() {
  for (const [name, queue] of Object.entries(queues)) {
    await queue.close();
    console.log(`🔌 Queue closed: ${name}`);
  }
  for (const [name, worker] of Object.entries(workers)) {
    await worker.close();
    console.log(`🔌 Worker closed: ${name}`);
  }
}

module.exports = {
  QUEUE_NAMES,
  emailQueue,
  videoQueue,
  aiQueue,
  cleanupQueue,
  createQueue,
  createWorker,
  initializeWorkers,
  closeAllQueues,
};
