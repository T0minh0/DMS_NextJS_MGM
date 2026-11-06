import { Metadata } from 'next';
import { RecoveryForm } from '@/components/recovery/RecoveryForm';
export const metadata: Metadata = {
  title: 'Confirmar e-mail | Recicla Mais',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <RecoveryForm
      confirmEmail
      token={
        typeof token === 'string' && token.length <= 256 ? token : undefined
      }
    />
  );
}
