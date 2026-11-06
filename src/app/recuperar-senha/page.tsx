import { Metadata } from 'next';
import { RecoveryForm } from '@/components/recovery/RecoveryForm';
export const metadata: Metadata = {
  title: 'Recuperar senha | Recicla Mais',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default async function RecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <RecoveryForm
      token={
        typeof token === 'string' && token.length <= 256 ? token : undefined
      }
    />
  );
}
