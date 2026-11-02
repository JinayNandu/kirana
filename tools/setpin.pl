#!/usr/bin/perl
# Set the code that opens the Store view.
#
#   perl tools/setpin.pl 418306
#   perl tools/setpin.pl --off          remove the gate entirely
#
# Writes salt / iterations / proof / seal into app/data/shop.json and
# NEVER the code itself. shop.json is served to every visitor, so a
# code written in it plainly would be a key left in the lock.
#
# This must agree with app/lock.js exactly -- same PBKDF2-SHA256, same
# 64-byte output, same split into a published `proof` and a private
# `token` whose SHA-256 is published as `seal`. If you change one,
# change the other, and re-run this to rewrite the file.
use strict;
use warnings;
use JSON::PP;
use Digest::SHA qw(hmac_sha256 sha256_hex);

my $here = $0; $here =~ s{[^/]+$}{};
my $file = ($here || './') . '../app/data/shop.json';

# Deliberately slow, and this is the honest size of what that buys.
#
# A six-digit code is a million possibilities. At this count a browser
# spends about a third of a second on one guess, so sweeping the lot
# from a page is days. Dedicated hardware is a different story -- a
# GPU running PBKDF2-SHA256 flat out gets through a million guesses in
# minutes, and no iteration count fixes that for six digits. What this
# DOES buy is that the code cannot simply be READ out of shop.json,
# which is the thing that would otherwise happen to every copy of this
# app the moment somebody opened developer tools.
#
# The whole point is that sweeping all 1,000,000
# six-digit codes costs hours rather than seconds -- so this number
# must hurt a little. Measured in Chrome before it was chosen; see
# CLAUDE.md. It lives in the FILE rather than in the code so that
# raising it later is a re-run of this script and nothing else.
my $ITER = 600000;

# ---------------------------------------------------------------------
#  PBKDF2-HMAC-SHA256. Fifteen lines, and no non-core module.
# ---------------------------------------------------------------------
sub pbkdf2 {
  my ($pass, $salt, $iter, $dklen) = @_;
  my $out = '';
  my $block = 1;
  while (length($out) < $dklen) {
    my $u = hmac_sha256($salt . pack('N', $block), $pass);
    my $t = $u;
    for (2 .. $iter) {
      $u = hmac_sha256($u, $pass);
      $t ^= $u;
    }
    $out .= $t;
    $block++;
  }
  return substr($out, 0, $dklen);
}

my $code = shift @ARGV;
unless (defined $code && length $code) {
  die "usage: perl tools/setpin.pl <6-digit code>\n"
    . "       perl tools/setpin.pl --off\n";
}

open my $fh, '<:raw', $file or die "$file: $!\n";
my $shop = do { local $/; JSON::PP->new->decode(<$fh>) };
close $fh;

if ($code eq '--off') {
  delete $shop->{staff};
  write_out($shop);
  print "The Store view is now OPEN to anyone who taps it.\n";
  exit 0;
}

die "The code must be exactly 6 digits -- got '$code'.\n"
  unless $code =~ /\A[0-9]{6}\z/;

# Four obvious ones, refused by name. A code anybody would try first
# is not a code, and finding that out from a script beats finding it
# out from a customer standing at the counter.
my %silly = map { $_ => 1 } qw(000000 111111 123456 654321 121212 999999);
die "'$code' is one of the first things anyone would try. Pick another.\n"
  if $silly{$code};

# The salt is published, so it does not have to be unguessable -- only
# unique to this shop, which is what stops one precomputed table
# covering every copy of this app.
my $salt = substr(sha256_hex(time . $$ . rand() . join('', @ARGV)), 0, 32);

my $dk    = pbkdf2($code, pack('H*', $salt), $ITER, 64);
my $proof = unpack('H*', substr($dk, 0, 32));
my $token = unpack('H*', substr($dk, 32, 32));
my $seal  = sha256_hex($token);

$shop->{staff} = {
  salt       => $salt,
  iterations => $ITER + 0,
  proof      => $proof,
  seal       => $seal,
  note       => 'The code that opens the Store view. The code ITSELF is not here '
              . 'and cannot be recovered from this file -- `proof` is PBKDF2-SHA256 of it '
              . "($ITER iterations), which only runs one way. To change the code: "
              . 'perl tools/setpin.pl <6 digits>, then commit and push. To remove the gate '
              . 'and let anyone open the Store view: perl tools/setpin.pl --off. '
              . 'Forgotten codes cannot be looked up; set a new one.',
};

write_out($shop);

print "Wrote app/data/shop.json.\n\n";
print "  The code for the Store view is now:  $code\n\n";
print "Tell the shopkeeper, and nobody else. It cannot be read back out\n";
print "of the file -- if it is forgotten, set a new one.\n\n";
print "Then:  git add -A && git commit -m \"new Store code\" && git push\n";

sub write_out {
  my ($data) = @_;
  open my $o, '>:raw', $file or die "write $file: $!\n";
  print $o JSON::PP->new->canonical->pretty->encode($data);
  close $o;
}
