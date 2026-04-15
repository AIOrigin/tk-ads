'use client';

import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/Button';
import { PRICE_DISPLAY } from '@/lib/constants';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

function PaymentForm({ onSuccess, onError }: {
  onSuccess: (paymentIntentId: string) => void;
  onError: (message: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [ready, setReady] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });

    if (error) {
      onError(error.message || 'Payment failed');
      setIsProcessing(false);
    } else if (paymentIntent && paymentIntent.status === 'succeeded') {
      onSuccess(paymentIntent.id);
    } else {
      onError('Payment was not completed');
      setIsProcessing(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement
        onReady={() => setReady(true)}
        options={{
          layout: 'tabs',
        }}
      />
      <Button
        type="submit"
        variant="glow"
        size="lg"
        className="w-full mt-4"
        disabled={!stripe || !ready || isProcessing}
        isLoading={isProcessing}
      >
        Pay {PRICE_DISPLAY}
      </Button>
    </form>
  );
}

export function PaymentSheet({ clientSecret, onSuccess, onError }: {
  clientSecret: string;
  onSuccess: (paymentIntentId: string) => void;
  onError: (message: string) => void;
}) {
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'night',
          variables: {
            colorPrimary: '#a855f7',
            colorBackground: '#1a1a1a',
            colorText: '#ffffff',
            colorTextSecondary: '#ffffff80',
            borderRadius: '12px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          },
        },
      }}
    >
      <PaymentForm onSuccess={onSuccess} onError={onError} />
    </Elements>
  );
}
