let currentTarget = process.env.VITE_API_URL || 'http://provider.gpufarm.xyz:31617';

export function updateTarget(newTarget) {
  currentTarget = newTarget;
}

export function getTarget() {
  return currentTarget;
} 