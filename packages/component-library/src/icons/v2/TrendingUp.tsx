import * as React from 'react';
import type { SVGProps } from 'react';
export const SvgTrendingUp = (props: SVGProps<SVGSVGElement>) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={2}
    className="lucide lucide-trending-up"
    viewBox="0 0 24 24"
    style={{
      color: 'inherit',
      ...props.style,
    }}
  >
    <path d="m22 7-8.5 8.5-5-5L2 17" fill="currentColor" />
    <path d="M16 7h6v6" fill="currentColor" />
  </svg>
);
