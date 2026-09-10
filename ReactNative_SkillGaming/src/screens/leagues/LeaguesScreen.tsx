import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppIcon from '../../components/common/AppIcon';
import { type LeagueData, type LeaguePlayer } from '../../services/leagueApi';
import LeagueBadge, { leagueColors } from './LeagueBadge';

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: cents % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;

function LeagueTierCarousel({ tiers }: { tiers: LeagueData['tiers'] }) {
  const scrollRef = useRef<ScrollView>(null);
  const [offset, setOffset] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const canScrollLeft = offset > 4;
  const canScrollRight =
    viewportWidth > 0 && contentWidth - viewportWidth - offset > 4;

  const scrollTwoLeagues = (direction: -1 | 1) => {
    const distance = 2 * (styles.tierCard.width + styles.tierStrip.gap);
    const maxOffset = Math.max(0, contentWidth - viewportWidth);
    scrollRef.current?.scrollTo({
      x: Math.max(0, Math.min(maxOffset, offset + direction * distance)),
      animated: true,
    });
  };

  return (
    <View style={styles.tierCarousel}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tierStrip}
        onLayout={event => setViewportWidth(event.nativeEvent.layout.width)}
        onContentSizeChange={width => setContentWidth(width)}
        onScroll={event => setOffset(event.nativeEvent.contentOffset.x)}
        scrollEventThrottle={16}
      >
        {tiers.map(item => (
          <View key={item.tier} style={styles.tierCard}>
            <LeagueBadge tier={item.tier} size={105} />
            <Text style={styles.tierName}>
              {item.name}
              {'\n'}League
            </Text>
            <Text style={styles.muted}>Prize pool</Text>
            <Text style={styles.tierPrize}>{money(item.poolCents)}</Text>
            <Text style={styles.small}>
              {item.threshold
                ? `${item.threshold.toLocaleString()} crowns to advance`
                : 'Highest league'}
            </Text>
          </View>
        ))}
      </ScrollView>
      {canScrollLeft && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scroll two leagues left"
          hitSlop={15.2}
          onPress={() => scrollTwoLeagues(-1)}
          style={[styles.tierArrow, styles.tierArrowLeft]}
        >
          <AppIcon name="arrow-left" size={14.4} color="#FFFFFF" />
        </Pressable>
      )}
      {canScrollRight && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scroll two leagues right"
          hitSlop={15.2}
          onPress={() => scrollTwoLeagues(1)}
          style={[styles.tierArrow, styles.tierArrowRight]}
        >
          <AppIcon name="arrow-right" size={14.4} color="#FFFFFF" />
        </Pressable>
      )}
    </View>
  );
}

function LeagueGlow({
  tier,
  centered = false,
}: {
  tier: number;
  centered?: boolean;
}) {
  return (
    <View
      pointerEvents="none"
      style={[styles.glow, centered && styles.glowCentered]}
    >
      {Array.from({ length: 28 }, (_, i) => (
        <View
          key={i}
          style={[
            styles.glowRing,
            {
              width: 600 - i * 18,
              height: 600 - i * 18,
              backgroundColor: leagueColors[tier],
            },
          ]}
        />
      ))}
    </View>
  );
}
export function LeagueRow({
  player,
  compact = false,
}: {
  player: LeaguePlayer;
  compact?: boolean;
}) {
  return (
    <View
      style={[
        styles.row,
        player.isMe && styles.myRow,
        compact && styles.compactRow,
      ]}
    >
      <Text style={styles.rank}>{player.rank}</Text>
      {player.photoUrl ? (
        <Image source={{ uri: player.photoUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.initial}>
            {player.name.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.playerInfo}>
        {player.isMe && <Text style={styles.you}>YOU</Text>}
        <Text numberOfLines={1} style={styles.playerName}>
          {player.name}
        </Text>
        <View style={styles.crowns}>
          <AppIcon name="crown" size={17} color="#E9AD49" />
          <Text style={styles.muted}>{player.crowns.toLocaleString()}</Text>
        </View>
      </View>
      {player.prizeCents > 0 && (
        <Text style={styles.prize}>{money(player.prizeCents)}</Text>
      )}
    </View>
  );
}
function Progress({ data }: { data: LeagueData }) {
  const threshold = data.tiers[data.tier].threshold;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>
        {threshold
          ? 'Progress to next league'
          : 'You’ve reached the highest league'}
      </Text>
      <View style={styles.progressRow}>
        <AppIcon name="crown" size={23} color="#E9AD49" />
        <Text style={styles.progressCount}>
          {data.crowns.toLocaleString()}
          {threshold ? ` / ${threshold.toLocaleString()}` : ' crowns'}
        </Text>
        {threshold && (
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                { width: `${Math.min(100, (data.crowns / threshold) * 100)}%` },
              ]}
            />
          </View>
        )}
      </View>
    </View>
  );
}
export default function LeaguesScreen({
  data,
  error,
  loading,
  onRefresh,
}: {
  data: LeagueData | null;
  error: string | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const [guide, setGuide] = useState(false);
  const [section, setSection] = useState<'standings' | 'payouts'>('standings');
  const [now, setNow] = useState(Date.now());
  const insets = useSafeAreaInsets();
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  // Keep the countdown aligned to the response's server clock, including clock-skewed phones.
  const [clock, setClock] = useState({ server: Date.now(), local: Date.now() });
  useEffect(() => {
    if (data)
      setClock({ server: Date.parse(data.serverTime), local: Date.now() });
  }, [data]);
  if (!data)
    return (
      <View style={styles.center}>
        {loading ? <ActivityIndicator color="#D0A27E" /> : null}
        <Text style={styles.muted}>{error || 'Loading your league…'}</Text>
        <Pressable accessibilityRole="button" onPress={onRefresh}>
          <Text style={styles.link}>Retry</Text>
        </Pressable>
      </View>
    );
  const tier = data.tiers[data.tier];
  const remaining = Math.max(
    0,
    Date.parse(data.endsAt) - (clock.server + now - clock.local),
  );
  const minutes = Math.floor(remaining / 60000);
  const countdown =
    remaining <= 0
      ? 'Settling league…'
      : `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h ${
          minutes % 60
        }m remaining`;
  return (
    <View style={styles.screen}>
      <LeagueGlow tier={data.tier} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={onRefresh}
            tintColor="#DDD"
          />
        }
      >
        <View style={styles.hero}>
          <LeagueBadge tier={data.tier} size={88} />
          <Text style={styles.title}>{tier.name} League</Text>
          <Text style={styles.pool}>
            Prize pool:{' '}
            <Text style={styles.white}>{money(tier.poolCents)}</Text>
          </Text>
          <Text style={styles.timer}>◷ {countdown}</Text>
        </View>
        {error && (
          <Pressable onPress={onRefresh}>
            <Text style={styles.error}>{error} Tap to retry.</Text>
          </Pressable>
        )}
        <Progress data={data} />
        <View style={styles.segment}>
          {(['standings', 'payouts'] as const).map(item => (
            <Pressable
              key={item}
              accessibilityRole="tab"
              accessibilityState={{ selected: section === item }}
              onPress={() => setSection(item)}
              style={[
                styles.segmentItem,
                section === item && styles.segmentSelected,
              ]}
            >
              <Text style={section === item ? styles.white : styles.muted}>
                {item === 'standings' ? 'Leaderboard' : 'Payouts'}
              </Text>
            </Pressable>
          ))}
        </View>
        {section === 'standings' ? (
          <View style={styles.board}>
            <View style={styles.boardHeader}>
              <Text style={styles.cardTitle}>CURRENT RANKINGS</Text>
              <Pressable
                accessibilityLabel="About weekly leagues"
                accessibilityRole="button"
                onPress={() => setGuide(true)}
                hitSlop={12}
              >
                <Text style={styles.help}>ⓘ</Text>
              </Pressable>
            </View>
            <Text style={styles.boardCaption}>Global top 20 · {tier.name}</Text>
            {data.top.map((player, index) => (
              <React.Fragment key={player.id}>
                <LeagueRow player={player} />
                {index + 1 === tier.winners && (
                  <Text style={styles.promotion}>
                    {data.tier === 7
                      ? `TOP ${tier.winners} WIN PRIZES`
                      : `▲  TOP ${tier.winners} WIN & ADVANCE  ▲`}
                  </Text>
                )}
              </React.Fragment>
            ))}
            {data.top.length < tier.winners && (
              <Text style={styles.promotion}>
                {data.tier === 7
                  ? `TOP ${tier.winners} WIN PRIZES`
                  : `▲  TOP ${tier.winners} WIN & ADVANCE  ▲`}
              </Text>
            )}
            <Text style={styles.footnote}>
              Earn at least 1 crown to qualify. Ties favour the player who
              reached their crown total first.
            </Text>
          </View>
        ) : (
          <View style={styles.board}>
            <View style={styles.boardHeader}>
              <Text style={styles.cardTitle}>LEAGUE PAYOUTS</Text>
            </View>
            <Text style={styles.footnote}>
              Bonus credits arrive in your demo wallet after the league ends.
              League rewards do not earn crowns.
            </Text>
            <Text style={styles.subheading}>This week’s prize split</Text>
            {data.prizes.map((amount, index) => (
              <View key={index} style={styles.payoutRow}>
                <Text style={styles.muted}>
                  #{index + 1}
                  {data.tier < 7 ? ' · advances' : ''}
                </Text>
                <Text style={styles.prize}>{money(amount)}</Text>
              </View>
            ))}
            <Text style={styles.footnote}>
              If fewer players qualify, the full pool is shared among them in
              these proportions. If nobody qualifies, there is no payout. Live
              leaderboard amounts reflect current qualifiers.
            </Text>
            <Text style={styles.subheading}>Your payout history</Text>
            {data.payouts.length === 0 && (
              <Text style={styles.footnote}>
                No league payouts yet. Finish in a prize position to earn your
                first reward.
              </Text>
            )}
            {data.payouts.map(payout => (
              <View key={payout.id} style={styles.payoutRow}>
                <View style={styles.playerInfo}>
                  <Text style={styles.white}>
                    {data.tiers[payout.tier].name} · #{payout.rank}
                  </Text>
                  <Text style={styles.small}>
                    {new Date(payout.endsAt).toLocaleDateString()} ·{' '}
                    {payout.paidAt ? 'Credited to wallet' : 'Processing'}
                  </Text>
                </View>
                <Text style={styles.prize}>{money(payout.amountCents)}</Text>
              </View>
            ))}
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={() => setGuide(true)}
          style={styles.guideButton}
        >
          <Text style={styles.link}>How weekly leagues work</Text>
        </Pressable>
      </ScrollView>
      {section === 'standings' && (
        <View style={styles.pinned}>
          <LeagueRow player={data.me} compact />
        </View>
      )}
      <Modal
        visible={guide}
        animationType="fade"
        onRequestClose={() => setGuide(false)}
        transparent
      >
        <View
          style={[
            styles.guide,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom },
          ]}
        >
          <LeagueGlow tier={data.tier} />
          <Pressable
            accessibilityLabel="Close league guide"
            accessibilityRole="button"
            onPress={() => setGuide(false)}
            style={styles.close}
          >
            <Text style={styles.closeText}>×</Text>
          </Pressable>
          <ScrollView contentContainerStyle={styles.guideContent}>
            <AppIcon name="crown" color="#E9AD49" size={27} />
            <Text style={styles.title}>Weekly Leagues</Text>
            <Text style={styles.intro}>
              Earn crowns to advance to the next league and win bonus cash.
            </Text>
            {guide && <LeagueTierCarousel tiers={data.tiers} />}
            <Text style={styles.rules}>
              You get a crown for every dollar of winning game payouts after
              fees. Leftover cents accumulate during the week. Refunds and
              league prizes do not earn crowns.
            </Text>
            <Text style={styles.rules}>
              The players in prize positions win a share of the pool and advance
              one tier. Ties favour whoever earned their crowns first. Master is
              the highest tier.
            </Text>
            <Text style={styles.rules}>
              Reach your tier’s crown threshold to advance instantly. Your
              crowns carry over, but you receive no payout from the tier you
              leave.
            </Text>
            <Text style={styles.rules}>
              League periods normally end Monday at midnight in New York. At
              each reset, crowns return to zero; your tier stays. Earn no crowns
              during a week and you drop one tier, with Bronze as the lowest.
            </Text>
            <Progress data={data} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

export function LeagueCelebration({
  data,
  visible,
  onDismiss,
  dismissing,
  error,
}: {
  data: LeagueData | null;
  visible: boolean;
  onDismiss: () => void;
  dismissing: boolean;
  error: string | null;
}) {
  const event = data?.events[0];
  if (!data || !event) return null;
  const position = event.reason === 'position';
  const tier = data.tiers[event.tier];
  const noticePlayers = data.top.some(player => player.isMe)
    ? data.top
    : [...data.top, data.me];
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Continue from league announcement"
        disabled={dismissing}
        onPress={onDismiss}
        style={styles.celebration}
      >
        <LeagueGlow tier={event.tier} centered />
        {!position && (
          <View pointerEvents="none" style={styles.rays}>
            {Array.from({ length: 20 }, (_, i) => (
              <View
                key={i}
                style={[styles.ray, { transform: [{ rotate: `${i * 9}deg` }] }]}
              />
            ))}
          </View>
        )}
        {!position && <Text style={styles.unlocked}>Unlocked!</Text>}
        <LeagueBadge tier={event.tier} size={position ? 96 : 142} />
        {position ? (
          <>
            <Text style={[styles.announcement, styles.positionAnnouncement]}>
              You increased your standing in {tier.name} League!
            </Text>
            <Text style={styles.rankChange}>
              #{event.previousRank} → #{event.rank}
            </Text>
            {event.tier === data.tier &&
              noticePlayers
                .filter(p => Math.abs(p.rank - (event.rank || 0)) <= 1)
                .map(player => (
                  <View key={player.id} style={styles.announcementRow}>
                    <LeagueRow player={player} compact />
                  </View>
                ))}
          </>
        ) : (
          <>
            <Text style={styles.welcome}>Welcome to</Text>
            <Text style={styles.announcement}>{tier.name} League</Text>
            <Text style={styles.muted}>
              {money(tier.poolCents)} weekly prize pool
            </Text>
          </>
        )}
        <View style={styles.continue}>
          <Text style={styles.white}>
            {dismissing ? 'Saving…' : 'Tap anywhere to continue'}
          </Text>
          {error && <Text style={styles.error}>{error}</Text>}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#080909' },
  content: { padding: 16, paddingBottom: 22 },
  glow: {
    position: 'absolute',
    top: -180,
    left: '50%',
    marginLeft: -300,
    width: 600,
    height: 600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: { position: 'absolute', opacity: 0.013, borderRadius: 300 },
  glowCentered: { top: '45%', marginTop: -300 },
  rays: {
    position: 'absolute',
    top: '45%',
    left: '50%',
    marginLeft: -300,
    marginTop: -300,
    width: 600,
    height: 600,
  },
  ray: {
    position: 'absolute',
    top: 0,
    left: 299,
    width: 2,
    height: 600,
    backgroundColor: '#B7CDD7',
    opacity: 0.035,
  },
  hero: { alignItems: 'center', paddingTop: 6, paddingBottom: 12, gap: 7 },
  title: {
    color: '#FFF',
    fontSize: 30,
    fontWeight: '600',
    textAlign: 'center',
  },
  pool: { fontSize: 17, color: '#B3A69F' },
  white: { color: '#FFF', fontSize: 15, fontWeight: '500' },
  muted: { color: '#99999D', fontSize: 14 },
  small: { color: '#9D9690', fontSize: 12, marginTop: 5 },
  timer: {
    color: '#CFC5BF',
    backgroundColor: '#261D1990',
    borderRadius: 30,
    paddingHorizontal: 20,
    paddingVertical: 11,
    marginTop: 6,
    fontSize: 14,
  },
  card: {
    backgroundColor: '#252322',
    borderRadius: 20,
    padding: 14,
    gap: 12,
    alignSelf: 'stretch',
  },
  cardTitle: {
    color: '#F4F3F2',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  progressCount: { color: '#EEE', fontSize: 14, fontWeight: '600' },
  track: {
    flex: 1,
    height: 6,
    backgroundColor: '#080808',
    overflow: 'hidden',
    borderRadius: 4,
  },
  fill: { height: '100%', backgroundColor: '#42D3E8' },
  segment: {
    flexDirection: 'row',
    padding: 4,
    marginVertical: 12,
    backgroundColor: '#1B1B1D',
    borderRadius: 13,
  },
  segmentItem: { flex: 1, padding: 9, alignItems: 'center', borderRadius: 10 },
  segmentSelected: { backgroundColor: '#38312C' },
  board: {
    borderRadius: 20,
    backgroundColor: '#0F1010',
    borderWidth: 1,
    borderColor: '#2A2725',
    overflow: 'hidden',
  },
  boardHeader: {
    backgroundColor: '#242323',
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  help: { color: '#AAA', fontSize: 22 },
  boardCaption: {
    color: '#887F78',
    textAlign: 'center',
    fontSize: 12,
    padding: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 17,
    gap: 10,
    minHeight: 84,
  },
  compactRow: { minHeight: 76, paddingVertical: 10 },
  myRow: {
    borderWidth: 1.5,
    borderColor: '#CD6B35',
    borderRadius: 18,
    backgroundColor: '#060707',
  },
  rank: { color: '#8F8E90', fontSize: 17, width: 29, textAlign: 'center' },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarFallback: {
    backgroundColor: '#514339',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { color: '#E8D3BC', fontSize: 20 },
  playerInfo: { flex: 1 },
  playerName: { fontSize: 15, color: '#F6F4F1' },
  you: { color: '#E67B3D', fontSize: 9, fontWeight: '800', marginBottom: 3 },
  crowns: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  prize: { color: '#22CF9A', fontWeight: '700', fontSize: 17 },
  promotion: {
    color: '#32CC9A',
    backgroundColor: '#242423',
    padding: 13,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  footnote: { color: '#95908B', fontSize: 12, lineHeight: 19, padding: 16 },
  subheading: {
    color: '#EEE5DC',
    fontSize: 16,
    fontWeight: '600',
    padding: 16,
  },
  payoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 17,
    paddingVertical: 13,
    gap: 14,
  },
  pinned: {
    paddingHorizontal: 16,
    paddingBottom: 6,
    paddingTop: 5,
    backgroundColor: '#080909',
  },
  guideButton: { alignItems: 'center', padding: 20 },
  link: { color: '#D3AF8D', fontSize: 14, padding: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 15 },
  error: { color: '#F2B19C', fontSize: 12, padding: 8, textAlign: 'center' },
  guide: { flex: 1, backgroundColor: '#160C07' },
  guideContent: {
    alignItems: 'center',
    padding: 20,
    paddingTop: 50,
    paddingBottom: 30,
    gap: 17,
  },
  close: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 3,
    borderRadius: 24,
    backgroundColor: '#FFFFFF15',
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 30, color: '#FFF', lineHeight: 33 },
  intro: {
    color: '#BCADA3',
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
  },
  tierCarousel: { alignSelf: 'stretch' },
  tierArrow: {
    position: 'absolute',
    top: '50%',
    transform: [{ translateY: -10.8 }],
    width: 21.6,
    height: 21.6,
    borderRadius: 10.8,
    backgroundColor: '#24150D',
    borderWidth: 1,
    borderColor: '#D3AF8D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierArrowLeft: { left: 0 },
  tierArrowRight: { right: 0 },
  tierStrip: { paddingVertical: 20, gap: 18 },
  tierCard: { width: 155, alignItems: 'center', gap: 12 },
  tierName: {
    color: '#FFF',
    fontSize: 22,
    textAlign: 'center',
    fontWeight: '500',
  },
  tierPrize: { color: '#35D5A6', fontSize: 22, fontWeight: '700' },
  rules: {
    color: '#B3A49A',
    fontSize: 14,
    lineHeight: 22,
    alignSelf: 'stretch',
  },
  celebration: {
    flex: 1,
    backgroundColor: '#03090E',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
    gap: 18,
  },
  unlocked: {
    color: '#FFF',
    fontSize: 27,
    fontWeight: '600',
    marginBottom: 22,
  },
  welcome: { color: '#A8ADB1', fontSize: 20, marginTop: 10 },
  announcement: {
    color: '#FFF',
    fontSize: 29,
    fontWeight: '600',
    textAlign: 'center',
  },
  positionAnnouncement: { fontSize: 24 },
  rankChange: { color: '#40D8AD', fontSize: 24, fontWeight: '600' },
  announcementRow: {
    width: '100%',
    backgroundColor: '#171819',
    borderRadius: 18,
  },
  continue: {
    position: 'absolute',
    bottom: 48,
    left: 20,
    right: 20,
    zIndex: 10,
    alignItems: 'center',
  },
});
