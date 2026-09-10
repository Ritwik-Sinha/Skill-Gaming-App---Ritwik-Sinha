import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import AppIcon from '../../components/common/AppIcon';
import JungleArtwork from '../../components/game/JungleArtwork';
import { getCardStyle, styles } from './PlayScreen.styles';

interface PlayScreenProps {
  onOpenGame: () => void;
}

export default function PlayScreen({ onOpenGame }: PlayScreenProps) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.eyebrow}>LET’S PLAY</Text>
      <Text style={styles.title} accessibilityRole="header">
        A little skill.{'\n'}A wild adventure.
      </Text>
      <Text style={styles.subtitle}>
        Find your rhythm. Go a little further.
      </Text>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Your games
        </Text>
        <Text style={styles.count}>01 GAME</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Jungle Swing"
        accessibilityHint="Opens the game description and how to play."
        onPress={onOpenGame}
        style={getCardStyle}
      >
        <View style={styles.artwork}>
          <JungleArtwork variant="hero" />
          <View style={styles.badge}>
            <View style={styles.badgeDot} />
            <Text style={styles.badgeText}>ENDLESS ADVENTURE</Text>
          </View>
        </View>
        <View style={styles.cardDetails}>
          <View style={styles.cardCopy}>
            <Text style={styles.gameTitle}>Jungle Swing</Text>
            <Text style={styles.gameDescription}>
              One touch. A jungle of possibilities.
            </Text>
          </View>
          <View style={styles.openButton}>
            <AppIcon name="arrow-right" size={22} />
          </View>
        </View>
      </Pressable>
    </ScrollView>
  );
}

