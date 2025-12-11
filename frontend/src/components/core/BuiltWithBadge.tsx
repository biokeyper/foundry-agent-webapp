import React from 'react';
import { Caption1Strong } from '@fluentui/react-components';
import { ArrowRight16Filled } from '@fluentui/react-icons';
import { AIFoundryLogo } from '../icons/AIFoundryLogo';
import styles from './BuiltWithBadge.module.css';

interface BuiltWithBadgeProps {
  className?: string;
}

export const BuiltWithBadge: React.FC<BuiltWithBadgeProps> = ({ className }) => {
  const handleClick = () => {
    // Link to Azure AI Foundry marketing page
    // In production, this could fetch user's Azure config and link to their specific project
    window.open('https://biokeyper.com/mootai', '_blank');
  };

  return (
    <button
      className={`${styles.badge} ${className || ''}`}
      onClick={handleClick}
      type="button"
      aria-label="Built with Azure AI Foundry"
    >
      <span className={styles.logo}>
        <AIFoundryLogo />
      </span>
      <Caption1Strong className={styles.description}>
        Built in Kampala
      </Caption1Strong>
      <Caption1Strong className={styles.brand}>
       with Love ❤️ <ArrowRight16Filled aria-hidden={true} />
      </Caption1Strong>
    </button>
  );
};
