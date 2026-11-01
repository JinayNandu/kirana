#!/usr/bin/perl
# The delivery-window state machine, across a whole simulated day.
#
#   perl tools/slots.pl
#
# This is the check that earns its keep. Which windows are open IS the
# product, it is time-dependent, and it cannot be tested by clicking --
# you would have to sit at the screen until 14:00 to watch one close.
#
# The 00:15 row is the whole point. A run id keyed on a UTC date is
# wrong for five and a half hours every night, and the symptom is "all
# the orders vanished at midnight" -- trivially reproducible at 1am,
# invisible in daylight.
use strict;
use warnings;
use JSON::PP;

my $here = $0; $here =~ s{[^/]+$}{};
my $root = $here || './';

open my $fh, '<:raw', $root . '../app/data/runplan.json' or die "runplan.json: $!\n";
local $/;
my $plan = JSON::PP->new->decode(<$fh>);
close $fh;

my @SLOTS = grep { $_->{enabled} } @{ $plan->{slots} };

sub mins { my ($h, $m) = split /:/, $_[0]; return $h * 60 + $m }

# Whole days since the epoch for a YYYY-MM-DD string. Pure integer
# arithmetic, no clock, no timezone -- the same shape as domain.js.
sub daynum {
  my ($y, $m, $d) = split /-/, $_[0];
  my $a = int((14 - $m) / 12);
  my $yy = $y + 4800 - $a;
  my $mm = $m + 12 * $a - 3;
  return $d + int((153 * $mm + 2) / 5) + 365 * $yy
       + int($yy / 4) - int($yy / 100) + int($yy / 400) - 32045;
}
sub addday {
  my ($date, $n) = @_;
  my $j = daynum($date) + $n;
  my $a = $j + 32044; my $b = int((4 * $a + 3) / 146097);
  my $c = $a - int(146097 * $b / 4); my $dd = int((4 * $c + 3) / 1461);
  my $e = $c - int(1461 * $dd / 4); my $mm = int((5 * $e + 2) / 153);
  my $day = $e - int((153 * $mm + 2) / 5) + 1;
  my $mon = $mm + 3 - 12 * int($mm / 10);
  my $yr  = 100 * $b + $dd - 4800 + int($mm / 10);
  return sprintf('%04d-%02d-%02d', $yr, $mon, $day);
}

# date + minute, NEVER minute-of-day alone.
sub stamp { return sprintf('%s#%04d', $_[0], $_[1]) }

sub run_state {
  my ($date, $slot, $now_date, $now_mins, $written) = @_;
  return $written if $written && $written ne 'open';
  return (stamp($now_date, $now_mins) ge stamp($date, mins($slot->{cutoff})))
    ? 'cutoff' : 'open';
}

sub bookable {
  my ($now_date, $now_mins) = @_;
  my @out;
  for my $date ($now_date, addday($now_date, 1)) {
    for my $s (@SLOTS) {
      next unless run_state($date, $s, $now_date, $now_mins) eq 'open';
      push @out, "run-$date-$s->{id}";
    }
  }
  return @out;
}

my $fails = 0;
sub is {
  my ($label, $got, $want) = @_;
  if ($got eq $want) { printf "  ok    %-34s %s\n", $label, $got; return }
  printf "  FAIL  %-34s\n          got  %s\n          want %s\n", $label, $got, $want;
  $fails++;
}

my $D  = '2026-10-28';
my $D1 = '2026-10-29';
my $N  = scalar @SLOTS;

printf "windows: %s\n\n", join(' ', map { "$_->{id} $_->{from}-$_->{to} (close $_->{cutoff})" } @SLOTS);

# Everyone gets the same window wherever they live -- so a window is
# either open or it is not, and there is nothing per-address to test.
print "what is bookable, through one day\n";

is('05:00 everything, both days', scalar(bookable($D, mins('05:00'))), $N * 2);

for my $s (@SLOTS) {
  my $cut = mins($s->{cutoff});
  is("$s->{cutoff} minus a minute: $s->{id} open",
     (grep { $_ eq "run-$D-$s->{id}" } bookable($D, $cut - 1)) ? 'yes' : 'no', 'yes');
  is("$s->{cutoff} plus a minute: $s->{id} gone",
     (grep { $_ eq "run-$D-$s->{id}" } bookable($D, $cut + 1)) ? 'yes' : 'no', 'no');
  # Tomorrow's same window must SURVIVE today's cut-off. This is the
  # one a bare clock comparison breaks: tomorrow's 10:00 looks
  # "earlier" than right now.
  is("$s->{cutoff} plus a minute: tomorrow's $s->{id} survives",
     (grep { $_ eq "run-$D1-$s->{id}" } bookable($D, $cut + 1)) ? 'yes' : 'no', 'yes');
}

# The dead window: after the last cut-off, nothing today at all.
my $last = (sort { mins($b->{cutoff}) <=> mins($a->{cutoff}) } @SLOTS)[0];
my @late = bookable($D, mins($last->{cutoff}) + 1);
is('after the last cut-off, nothing today',
   (grep { /^run-$D-/ } @late) ? 'something' : 'none', 'none');
is('after the last cut-off, tomorrow stands', scalar(grep { /^run-$D1-/ } @late), $N);
is('23:59 tomorrow only', scalar(bookable($D, mins('23:59'))), $N);

# THE UTC TRAP. At 00:15 IST the date has already rolled over, so
# "today" is the 29th and all of its windows are open again. A run id
# built from toISOString() would still say the 28th here.
my @mid = bookable($D1, mins('00:15'));
is('00:15 today IS the new date', $mid[0], "run-$D1-$SLOTS[0]{id}");
is('00:15 all of the new day open', scalar(grep { /^run-$D1-/ } @mid), $N);
is('00:15 nothing from the old day', (grep { /^run-$D-/ } @mid) ? 'leaked' : 'none', 'none');

# A window the shopkeeper closed early is closed whatever the clock says.
is('written state beats the clock',
   run_state($D, $SLOTS[0], $D, mins('05:00'), 'cutoff'), 'cutoff');
is('clock decides when nothing written',
   run_state($D, $SLOTS[0], $D, mins('05:00'), 'open'), 'open');

# --- no UTC date anywhere in the app ---------------------------------
print "\ntoISOString / getTimezoneOffset outside domain.js\n";
my @offenders;
for my $f (glob($root . '../app/*.js')) {
  next if $f =~ /domain\.js$/;
  open my $g, '<:encoding(UTF-8)', $f or next;
  my $n = 0;
  while (my $l = <$g>) {
    $n++;
    next if $l =~ m{^\s*//};
    push @offenders, "$f:$n" if $l =~ /toISOString\s*\(\s*\)\s*\.\s*slice/
                             || $l =~ /getTimezoneOffset/;
  }
  close $g;
}
if (@offenders) { print "  FAIL  $_\n" for @offenders; $fails += scalar @offenders }
else { print "  ok    no UTC date arithmetic outside domain.js\n" }

print $fails ? "\n$fails FAILED\n" : "\nall window rules hold\n";
exit($fails ? 1 : 0);
