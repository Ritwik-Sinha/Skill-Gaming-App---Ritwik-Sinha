import React from 'react';
import { Image } from 'react-native';

export const leagueColors = [
  '#CF966D',
  '#B7CDD7',
  '#E9BC62',
  '#D8E3EE',
  '#6CAEFF',
  '#F47789',
  '#D8D2FC',
  '#F8D796',
];
const names = [
  'Bronze',
  'Silver',
  'Gold',
  'Platinum',
  'Sapphire',
  'Ruby',
  'Diamond',
  'Master',
];
const badges = [
  require('../../assets/leagues/bronze.png'),
  require('../../assets/leagues/silver.png'),
  require('../../assets/leagues/gold.png'),
  require('../../assets/leagues/platinum.png'),
  require('../../assets/leagues/sapphire.png'),
  require('../../assets/leagues/ruby.png'),
  require('../../assets/leagues/diamond.png'),
  require('../../assets/leagues/master.png'),
];
export default function LeagueBadge({
  tier,
  size = 130,
}: {
  tier: number;
  size?: number;
}) {
  return (
    <Image
      source={badges[tier] || badges[0]}
      resizeMode="contain"
      accessibilityLabel={`${names[tier]} league badge`}
      style={{ width: size * 1.3, height: size * 1.3 }}
    />
  );
}
