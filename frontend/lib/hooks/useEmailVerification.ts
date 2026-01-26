import { useRouter } from 'next/navigation';
import { useAuthStore } from '../stores/authStore';

export function useEmailVerification() {
  const router = useRouter();
  const user = useAuthStore(state => state.user);

  const isVerified = user?.emailVerified === true;

  const requireVerification = (callback?: () => void) => {
    if (!user) {
      router.push('/login');
      return false;
    }

    if (!isVerified) {
      router.push(`/verify-email?email=${encodeURIComponent(user.email)}`);
      return false;
    }

    if (callback) {
      callback();
    }
    return true;
  };

  const handleApiResponse = async (response: Response) => {
    if (response.status === 403) {
      try {
        const data = await response.clone().json();
        if (data.requiresVerification && data.email) {
          router.push(`/verify-email?email=${encodeURIComponent(data.email)}`);
          return { requiresVerification: true, data };
        }
      } catch (e) {
      }
    }
    return { requiresVerification: false, data: null };
  };

  return {
    isVerified,
    requireVerification,
    handleApiResponse,
    userEmail: user?.email
  };
}
