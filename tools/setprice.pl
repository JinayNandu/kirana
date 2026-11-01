#!/usr/bin/perl
# Apply price corrections to the catalogue.
#
#   perl tools/setprice.pl prices.txt
#   perl tools/setprice.pl prices.txt --dry
#   echo "p-atta-aash5 275" | perl tools/setprice.pl -
#
# Reads lines of `<id> <price>` and ignores everything after. Blank
# lines, # comments and anything that is not two readable fields are
# skipped, so a file edited by hand -- or a few lines pasted out of a
# message -- both work.
#
# A price ABOVE the current MRP is taken to mean the shop sells at MRP,
# and the MRP is raised to match. Otherwise the app would advertise a
# saving that does not exist, which is worse than showing no saving at
# all.
use strict;
use warnings;
use JSON::PP;

my @args = @ARGV;
my $dry  = grep { $_ eq '--dry' } @args;
@args = grep { $_ ne '--dry' } @args;
my $src = shift @args or die "usage: perl tools/setprice.pl <prices.txt|-> [--dry]\n";

my $here = $0; $here =~ s{[^/]+$}{};
my $D = ($here || './') . '../app/data/';

open my $cf, '<:raw', $D . 'catalog.json' or die "catalog.json: $!\n";
my $cat = do { local $/; JSON::PP->new->decode(<$cf>) };
close $cf;

my %by = map { $_->{id} => $_ } @{ $cat->{products} };

my $in;
if ($src eq '-') { $in = \*STDIN }
else { open $in, '<:encoding(UTF-8)', $src or die "$src: $!\n" }

my (@changed, @same, @unknown, @bad, @mrpUp);
my $line = 0;
while (my $l = <$in>) {
  $line++;
  $l =~ s/^\s+|\s+$//g;
  next if $l eq '' || $l =~ /^#/;

  my ($id, $price) = $l =~ /^(\S+)\s+(\d+)/;
  unless (defined $id && defined $price) { push @bad, "$line: $l"; next }

  my $p = $by{$id};
  unless ($p) { push @unknown, "$line: $id"; next }

  if ($price <= 0) { push @bad, "$line: $id price $price is not positive"; next }

  if ($p->{price} == $price) { push @same, $id; next }

  my $was = $p->{price};
  $p->{price} = $price;

  # Selling at or above the printed MRP: raise the MRP rather than
  # advertise a saving that is not real.
  if ($price > $p->{mrp}) {
    push @mrpUp, sprintf('%-20s MRP %d -> %d', $id, $p->{mrp}, $price);
    $p->{mrp} = $price;
  }
  push @changed, sprintf('%-20s %4d -> %-4d  %s', $id, $was, $price, $p->{name}{en});
}
close $in unless $src eq '-';

print "changed (", scalar @changed, ")\n";
print "  $_\n" for @changed;
print "\nMRP raised to match (", scalar @mrpUp, ") -- no discount will be shown on these\n" if @mrpUp;
print "  $_\n" for @mrpUp;
printf "\nunchanged: %d\n", scalar @same if @same;

if (@unknown) {
  print "\nNO SUCH PRODUCT (", scalar @unknown, ") -- nothing written for these\n";
  print "  $_\n" for @unknown;
}
if (@bad) {
  print "\nCOULD NOT READ (", scalar @bad, ")\n";
  print "  $_\n" for @bad;
}

if ($dry) { print "\n--dry: nothing written\n"; exit(@unknown || @bad ? 1 : 0) }

unless (@changed) { print "\nnothing to write\n"; exit(@unknown || @bad ? 1 : 0) }

open my $o, '>:raw', $D . 'catalog.json' or die "write catalog.json: $!\n";
print $o JSON::PP->new->canonical->pretty->encode($cat);
close $o;
print "\nwrote app/data/catalog.json\n";
print "now run: perl tools/data.pl\n";
exit(@unknown || @bad ? 1 : 0);
