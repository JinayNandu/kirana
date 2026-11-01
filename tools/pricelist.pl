#!/usr/bin/perl
# Print the catalogue as an editable price list.
#
#   perl tools/pricelist.pl > prices.txt
#
# The shopkeeper edits the PRICE column and tools/setprice.pl reads it
# back. Only the first two fields on a line are read, so the MRP and
# the product name can stay on the line as a reminder without being
# parsed -- and a line can be deleted without consequence, because
# anything absent is simply left alone.
use strict;
use warnings;
use JSON::PP;

my $here = $0; $here =~ s{[^/]+$}{};
my $D = ($here || './') . '../app/data/';

sub slurp {
  open my $f, '<:raw', $D . $_[0] or die "$_[0]: $!\n";
  local $/; my $j = JSON::PP->new->decode(<$f>); close $f; return $j;
}

my $shop = slurp('shop.json');
my $cat  = slurp('catalog.json');
my $cats = slurp('categories.json');

my %catname = map { $_->{id} => $_->{name}{en} } @{ $cats->{categories} };
my @order   = map { $_->{id} } sort { $a->{order} <=> $b->{order} } @{ $cats->{categories} };

my %units = (g => 'g', kg => 'kg', ml => 'ml', l => 'L', pc => 'pc', pkt => 'pkt', dozen => 'dozen');

print "# $shop->{name}{en} -- price list\n";
print "#\n";
print "# Edit the PRICE column. Send the whole file back, or just the lines\n";
print "# you changed -- anything missing is left exactly as it is.\n";
print "#\n";
print "# Only the first two fields are read: <id> <price>. The bracketed MRP\n";
print "# and the name are there for you, and are ignored.\n";
print "#\n";
print "# If a price comes back HIGHER than the MRP shown, setprice.pl takes\n";
print "# that to mean the shop sells at MRP and raises the MRP to match, so\n";
print "# the app stops claiming a discount that is not there.\n";
print "#\n";
print "# Apply with:  perl tools/setprice.pl prices.txt\n";
print "\n";

my %bycat;
push @{ $bycat{ $_->{cat} } }, $_ for @{ $cat->{products} };

my $n = 0;
for my $c (@order) {
  next unless $bycat{$c};
  printf "\n# %s %s\n", $catname{$c}, '-' x (58 - length $catname{$c});
  for my $p (sort { $a->{brand} cmp $b->{brand} || $a->{name}{en} cmp $b->{name}{en} } @{ $bycat{$c} }) {
    my $label = (($p->{brand} && $p->{brand} ne 'Shop'
                  && index(lc $p->{name}{en}, lc $p->{brand}) != 0) ? $p->{brand} . ' ' : '')
              . $p->{name}{en};
    my $pack = $p->{pack}{n} . ' ' . ($units{ $p->{pack}{u} } // $p->{pack}{u});
    printf "%-20s %5d   (MRP %4d)   %s, %s\n", $p->{id}, $p->{price}, $p->{mrp}, $label, $pack;
    $n++;
  }
}

printf "\n# %d products.\n", $n;
