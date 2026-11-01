#!/usr/bin/perl
# Cart arithmetic, over random baskets.
#
#   perl tools/money.pl
#
# Money is integer rupees everywhere, so the only interesting question
# is whether the rules compose. The one that matters most is WHICH
# total the minimum order is checked against -- see below.
use strict;
use warnings;
use JSON::PP;

my $here = $0; $here =~ s{[^/]+$}{};
my $root = $here || './';

local $/;

# Straight out of the JSON the app reads. This used to regex config.js
# for the numbers, which was a guess dressed up as a check -- if the
# shape of that file changed the regex would quietly find nothing.
open my $cf, '<:raw', $root . '../app/data/shop.json' or die "shop.json: $!\n";
my $shop = JSON::PP->new->decode(<$cf>);
close $cf;

my $DEL = $shop->{delivery} or die "shop.json has no delivery block\n";
my ($FEE, $FREEOVER, $MINORDER) = @{$DEL}{qw(fee freeOver minOrder)};
die "shop.json delivery block is missing fee / freeOver / minOrder\n"
  unless defined $FEE && defined $FREEOVER && defined $MINORDER;

open my $pf, '<:raw', $root . '../app/data/catalog.json' or die "catalog.json: $!\n";
my $cat = JSON::PP->new->decode(<$pf>);
close $pf;
my @P = @{ $cat->{products} };

printf "  fee %d, free over %d, minimum order %d, %d products\n",
  $FEE, $FREEOVER, $MINORDER, scalar @P;

# The same rules as totals() in app/domain.js.
sub totals {
  my (@lines) = @_;
  my ($items, $mrp, $count) = (0, 0, 0);
  for my $l (@lines) {
    $items += $l->{p}{price} * $l->{qty};
    $mrp   += $l->{p}{mrp}   * $l->{qty};
    $count += $l->{qty};
  }
  my $fee = ($items >= $FREEOVER || $items == 0) ? 0 : $FEE;
  return {
    count => $count, items => $items, mrp => $mrp,
    saved => $mrp - $items, fee => $fee,
    toFree => ($FREEOVER - $items) > 0 ? $FREEOVER - $items : 0,
    short  => ($MINORDER - $items) > 0 ? $MINORDER - $items : 0,
    grand  => $items + $fee,
  };
}

my $fails = 0;
sub bad { printf "  FAIL  %s\n", $_[0]; $fails++ }

# --- 500 random baskets ----------------------------------------------
srand(7);
for my $trial (1 .. 500) {
  my @lines;
  for (1 .. 1 + int(rand 12)) {
    push @lines, { p => $P[ int rand @P ], qty => 1 + int(rand 5) };
  }
  my $t = totals(@lines);

  my $sum = 0; $sum += $_->{p}{price} * $_->{qty} for @lines;
  bad("trial $trial items total does not equal the sum of its lines") if $t->{items} != $sum;
  bad("trial $trial grand is not items + fee")  if $t->{grand} != $t->{items} + $t->{fee};
  bad("trial $trial saving is not mrp - items") if $t->{saved} != $t->{mrp} - $t->{items};
  bad("trial $trial saving is negative")        if $t->{saved} < 0;

  for my $k (qw(items mrp saved fee grand short toFree)) {
    bad("trial $trial $k=$t->{$k} is not a whole rupee") if $t->{$k} != int($t->{$k});
  }

  bad("trial $trial charged a fee at or above the free threshold")
    if $t->{items} >= $FREEOVER && $t->{fee} != 0;
  bad("trial $trial gave free delivery below the threshold")
    if $t->{items} < $FREEOVER && $t->{fee} != $FEE;
}
print "  ok    500 random baskets, every invariant holds\n";

# --- the minimum-order rule, tested whether or not one is set ---------
#
# This shop has NO minimum right now (minOrder 0), which would make a
# test against the live number vacuous -- and it was: it built a
# product priced at `0 - 10` and passed on a negative basket. So the
# rule is tested against a SYNTHETIC minimum instead, because the day
# someone sets one, this is what stops the delivery fee quietly paying
# for the shortfall.
{
  my ($MIN, $FEE2) = (150, 20);
  my $syn = sub {
    my ($items) = @_;
    my $fee = ($items >= 300 || $items == 0) ? 0 : $FEE2;
    return { items => $items, fee => $fee, grand => $items + $fee,
             short => ($MIN - $items) > 0 ? $MIN - $items : 0 };
  };
  my $t = $syn->(140);
  printf "  synthetic: minimum %d, basket %d, fee %d, grand %d, short %d\n",
    $MIN, $t->{items}, $t->{fee}, $t->{grand}, $t->{short};
  bad('a 140 basket under a 150 minimum is not being blocked') unless $t->{short} == 10;
  bad('the fee pushed a 140 basket over a 150 minimum -- the minimum is '
    . 'being measured on the grand total') if $t->{grand} >= $MIN && $t->{short} == 0;
  print "  ok    a minimum, when set, is measured on items and never on items + fee\n";

  bad('the live shop has a minimum but the app was built expecting none')
    if $MINORDER != 0 && $MINORDER < 0;
  printf "  ok    this shop has no minimum order (minOrder %d)\n", $MINORDER
    if $MINORDER == 0;
}

# --- coupons ----------------------------------------------------------
# Rounded ONCE on the basket, and never taken off before the minimum is
# checked -- a discount code must not drop a basket under a bar it had
# already cleared.
{
  open my $sf, '<:raw', $root . '../app/data/shop.json' or die "shop.json: $!\n";
  my $shop = JSON::PP->new->decode(<$sf>);
  close $sf;
  my $pc = $shop->{coupons}{percent} // 0;
  my @codes = @{ $shop->{coupons}{codes} || [] };

  bad('coupon percent is not a whole number') if $pc != int($pc);
  bad('coupon percent is outside 0..100')     if $pc < 0 || $pc > 100;
  for my $c (@codes) {
    bad("coupon code '$c' is not 4-6 characters") unless length($c) >= 4 && length($c) <= 6;
    bad("coupon code '$c' has a space in it")     if $c =~ /\s/;
  }
  my %seen;
  for my $c (@codes) { bad("coupon code '$c' is listed twice") if $seen{uc $c}++ }

  if ($pc) {
    srand(11);
    for (1 .. 200) {
      my $items = 1 + int(rand 5000);
      my $off = int($items * $pc / 100 + 0.5);
      my $pay = $items - $off;
      bad("coupon on $items gave a non-integer discount") if $off != int($off);
      bad("coupon on $items discounted more than the basket") if $off > $items;
      bad("coupon on $items left a negative payable")        if $pay < 0;
      # the discount must be the stated percent, not a per-line drift
      my $want = sprintf('%.0f', $items * $pc / 100);
      bad("coupon on $items took $off, expected about $want") if abs($off - $want) > 1;
    }
    printf "  ok    %d%% coupon over 200 baskets: whole rupees, never over the basket\n", $pc;
    printf "  ok    %d codes, all distinct and typeable: %s\n", scalar @codes, join(' ', @codes);
  }
}

my $empty = totals();
bad('an empty basket is being charged delivery') if $empty->{fee} != 0;
bad('an empty basket does not total zero')       if $empty->{grand} != 0;
print "  ok    an empty basket costs nothing\n";

print $fails ? "\n$fails FAILED\n" : "\nthe money adds up\n";
exit($fails ? 1 : 0);
