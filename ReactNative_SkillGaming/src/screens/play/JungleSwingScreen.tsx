import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import AppIcon from '../../components/common/AppIcon';
import JungleArtwork from '../../components/game/JungleArtwork';
import BetSelectionModal from '../../components/game/BetSelectionModal';
import {
  getBackButtonStyle,
  getPlayButtonStyle,
  getStepImageStyle,
  getStepStyle,
  styles,
} from './JungleSwingScreen.styles';

const instructions = [
  {
    title: 'Hold on. Let go. Fly.',
    description:
      'Tap and hold to latch onto a swing. Release to fly with your momentum, then catch the next swing.',
    variant: 'swing',
  },
  {
    title: 'Stay above the water.',
    description:
      'Bounce off floating logs to stay above the river. If you land in the water, your run ends.',
    variant: 'bounce',
  },
  {
    title: 'Stay ahead of the snake.',
    description:
      'A snake is always chasing you. Keep moving from swing to swing so you don’t get caught.',
    variant: 'snake',
  },
  {
    title: 'Go the distance.',
    description:
      'Your score is based on how far you travel. Get as far as you can before falling or getting caught.',
    variant: 'distance',
  },
] as const;

interface JungleSwingScreenProps {
  onBack: () => void;
  onPlay: (amountCents: number) => void;
  disabled?: boolean;
}

export default function JungleSwingScreen({
  onBack,
  onPlay,
  disabled = false,
}: JungleSwingScreenProps) {
  const [showBetSelection, setShowBetSelection] = useState(false);
  const { width, fontScale } = useWindowDimensions();
  const stackedInstructions = width < 350 || fontScale > 1.3;

  return (
    <View style={styles.screen}>
      <View style={styles.navigation}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to games"
          style={getBackButtonStyle}
        >
          <AppIcon name="arrow-left" size={23} />
        </Pressable>
        <Text style={styles.navigationTitle}>Jungle Swing</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <JungleArtwork variant="hero" />
        </View>

        <View style={styles.description}>
          <Text style={styles.title} accessibilityRole="header">
            Small chameleon. Big adventure.
          </Text>
          <Text style={styles.body}>
            Swing through a lush jungle, leap across the river and stay one step
            ahead of a hungry snake. Find your timing and see how far you can
            go.
          </Text>
          <View style={styles.tags}>
            {['One-touch controls', 'Endless adventure'].map(tag => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.instructions}>
          <View style={styles.instructionsHeading}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              How to play
            </Text>
            <Text style={styles.stepCount}>FOUR SIMPLE STEPS</Text>
          </View>
          {instructions.map((instruction, index) => (
            <View
              key={instruction.variant}
              style={getStepStyle(
                stackedInstructions,
                index === instructions.length - 1,
              )}
            >
              <View style={getStepImageStyle(width, stackedInstructions)}>
                <JungleArtwork variant={instruction.variant} />
              </View>
              <View style={styles.stepCopy}>
                <Text style={styles.stepNumber}>0{index + 1}</Text>
                <Text style={styles.stepTitle}>{instruction.title}</Text>
                <Text style={styles.stepDescription}>
                  {instruction.description}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.playFooter}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Bet and Play"
          accessibilityHint="Opens the bet options. Select and confirm a bet to start playing."
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => {
            if (!disabled) setShowBetSelection(true);
          }}
          style={state => [
            getPlayButtonStyle(state),
            disabled && styles.playDisabled,
          ]}
        >
          <AppIcon name="play" size={19} />
          <Text style={styles.playLabel}>Bet and Play</Text>
        </Pressable>
      </View>
      <BetSelectionModal
        visible={showBetSelection}
        disabled={disabled}
        onClose={() => setShowBetSelection(false)}
        onPlay={amountCents => {
          setShowBetSelection(false);
          onPlay(amountCents);
        }}
      />
    </View>
  );
}
